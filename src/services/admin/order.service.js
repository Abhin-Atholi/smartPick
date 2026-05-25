import Order from '../../model/orderModel.js';
import Product from '../../model/productModel.js';
import * as walletService from '../user/wallet.service.js';
import * as taxHelper from '../../utils/taxHelper.js';
import * as orderLifecycleService from '../common/orderLifecycle.service.js';
import { withTransaction, sessionOpts } from '../../utils/transactionHelper.js';

// ── Admin-settable status transitions ────────────────────────────────────────
// "Return Requested" is user-triggered only; admin cannot set it manually.
const ALLOWED_TRANSITIONS = {
    'Processing':       ['Shipped', 'Cancelled'],
    'Shipped':          ['Out for Delivery'],
    'Out for Delivery': ['Delivered'],
    'Delivered':        [],           // returns come from user side
    'Return Requested': [],           // admin approves/rejects via separate flow
    'Returned':         [],
    'Return Rejected':  [],
    'Cancelled':        []
};



// ── Order listing with search / filter / sort / pagination ───────────────────
export const getAllOrders = async ({
    page = 1, limit = 10, search = '',
    status = 'All', dateFrom = '', dateTo = '', sort = 'newest'
} = {}) => {
    const skip = (page - 1) * limit;
    const query = {};

    if (status === 'Failed/Expired') {
        query.orderStatus = { $in: ['Payment Pending', 'Payment Failed', 'Expired'] };
    } else if (status === 'All') {
        query.orderStatus = { $nin: ['Payment Pending', 'Payment Failed', 'Expired'] };
    } else if (status) {
        query.orderStatus = status;
    }

    if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) { const d = new Date(dateFrom); d.setHours(0,0,0,0);  query.createdAt.$gte = d; }
        if (dateTo)   { const d = new Date(dateTo);   d.setHours(23,59,59,999); query.createdAt.$lte = d; }
    }

    if (search && search.trim()) {
        const term = search.trim();
        const User = (await import('../../model/userModel.js')).default;
        const uIds = (await User.find({
            $or: [{ fullName: { $regex: term, $options: 'i' } }, { email: { $regex: term, $options: 'i' } }]
        }, '_id').lean()).map(u => u._id);

        query.$or = [
            { orderId: { $regex: term, $options: 'i' } },
            ...(uIds.length ? [{ user: { $in: uIds } }] : [])
        ];
    }

    const sortMap = {
        newest: { updatedAt: -1 }, oldest: { updatedAt: 1 },
        amount_desc: { totalAmount: -1 }, amount_asc: { totalAmount: 1 }
    };

    const [orders, totalOrders] = await Promise.all([
        Order.find(query)
            .populate('user', 'fullName email profileImage')
            .populate('items.product', 'name')
            .sort(sortMap[sort] || { updatedAt: -1 })
            .skip(skip).limit(limit).lean(),
        Order.countDocuments(query)
    ]);

    // ── Stats ────────────────────────────────────────────────────────────────
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);

    // Sum of quantities of delivered items across all orders
    const deliveredAgg = await Order.aggregate([
        { $unwind: '$items' },
        { $match: { 'items.itemStatus': 'Delivered' } },
        { $group: { _id: null, total: { $sum: '$items.quantity' } } }
    ]);
    const deliveredProductsCount = deliveredAgg[0]?.total || 0;

    // Count of cancelled + returned items
    const cancelledReturnedAgg = await Order.aggregate([
        { $unwind: '$items' },
        { $match: { 'items.itemStatus': { $in: ['Cancelled', 'Returned'] } } },
        { $count: 'total' }
    ]);
    const cancelledReturnedCount = cancelledReturnedAgg[0]?.total || 0;

    // Count of true pending return request items
    const pendingReturnsAgg = await Order.aggregate([
        { $unwind: '$items' },
        { $match: { 'items.itemStatus': 'Return Requested' } },
        { $count: 'total' }
    ]);
    const returnRequestCount = pendingReturnsAgg[0]?.total || 0;

    // Status counts
    const statusCountsAgg = await Order.aggregate([
        { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
    ]);
    
    const statsObj = {
        Processing: 0, Shipped: 0, 'Out for Delivery': 0, 
        Cancelled: 0, Returned: 0,
        Delivered: 0, totalAll: 0, failedExpiredCount: 0
    };
    
    statusCountsAgg.forEach(s => {
        if (s._id in statsObj) statsObj[s._id] = s.count;
        
        if (['Payment Pending', 'Payment Failed', 'Expired'].includes(s._id)) {
            statsObj.failedExpiredCount += s.count;
        } else {
            statsObj.totalAll += s.count;
        }
    });

    return {
        orders, totalOrders,
        totalPages: Math.ceil(totalOrders / limit),
        currentPage: page,
        stats: {
            totalAll: statsObj.totalAll,
            pendingCount: statsObj.Processing,
            shippedCount: statsObj.Shipped,
            outForDeliveryCount: statsObj['Out for Delivery'],
            cancelledCount: statsObj.Cancelled,
            returnRequestCount: returnRequestCount,
            returnedCount: statsObj.Returned,
            deliveredProductsCount,
            cancelledReturnedCount,
            failedExpiredCount: statsObj.failedExpiredCount
        }
    };
};

// ── Single order (admin — no ownership check) ────────────────────────────────
export const getOrderByIdAdmin = async (orderId) =>
    Order.findById(orderId)
        .populate('user', 'fullName email profileImage phone')
        .populate({ path: 'items.product', populate: { path: 'category', select: 'name' } })
        .lean();

// ── Update whole-order status ─────────────────────────────────────────────────
export const updateOrderStatus = async (orderId, newStatus, adminId) => {
    return withTransaction(async (session) => {
        const q = Order.findById(orderId);
        if (session) q.session(session);
        const order = await q;
        if (!order) return { success: false, message: 'Order not found' };

        try {
            await orderLifecycleService.updateOrderStatus(order, adminId, newStatus, session);
            return { success: true, message: `Status updated to "${newStatus}"` };
        } catch (err) {
            return { success: false, message: err.message };
        }
    });
};

// ── Cancel a single item (admin) ──────────────────────────────────────────────
export const cancelOrderItem = async (orderId, itemId, adminId) => {
    return withTransaction(async (session) => {
        const q = Order.findById(orderId);
        if (session) q.session(session);
        const order = await q;
        if (!order) return { success: false, message: 'Order not found' };

        try {
            await orderLifecycleService.cancelOrderItem(order, itemId, adminId, 'admin', 'Cancelled by admin', session);
            return { success: true, message: 'Item cancelled and stock restored' };
        } catch (err) {
            return { success: false, message: err.message };
        }
    });
};

// ── Return requests listing (Flattened Item-Level) ────────────────────────────
export const getReturnRequests = async ({ page = 1, limit = 10, status = 'Return Requested', search = '' } = {}) => {
    const skip = (page - 1) * limit;

    const pipeline = [
        { $unwind: '$items' }
    ];

    // Filter by item status
    if (status === 'Return Rejected') {
        pipeline.push({ $match: { 'items.returnRejected': true } });
    } else if (status && status !== 'All') {
        pipeline.push({ $match: { 'items.itemStatus': status } });
    } else {
        // Default to showing all return-related statuses
        pipeline.push({
            $match: {
                $or: [
                    { 'items.itemStatus': { $in: ['Return Requested', 'Returned'] } },
                    { 'items.returnRejected': true }
                ]
            }
        });
    }

    if (search && search.trim()) {
        const term = search.trim();
        const User = (await import('../../model/userModel.js')).default;
        const uIds = (await User.find({
            $or: [{ fullName: { $regex: term, $options: 'i' } }, { email: { $regex: term, $options: 'i' } }]
        }, '_id').lean()).map(u => u._id);

        pipeline.push({
            $match: {
                $or: [
                    { orderId: { $regex: term, $options: 'i' } },
                    ...(uIds.length ? [{ user: { $in: uIds } }] : [])
                ]
            }
        });
    }

    pipeline.push(
        { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'userObj' } },
        { $unwind: { path: '$userObj', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'productObj' } },
        { $unwind: { path: '$productObj', preserveNullAndEmptyArrays: true } },
        { $sort: { 'items.updatedAt': -1, updatedAt: -1 } }
    );

    const [results, countResult] = await Promise.all([
        Order.aggregate([...pipeline, { $skip: skip }, { $limit: limit }]),
        Order.aggregate([...pipeline, { $count: 'total' }])
    ]);

    const total = countResult[0]?.total || 0;
    
    return {
        returnItems: results,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page
    };
};

// ── Approve or reject a return request (per item) ─────────────────────────────
export const handleReturnDecision = async (orderId, itemId, decisionPayload, adminId) => {
    return withTransaction(async (session) => {
        const q = Order.findById(orderId);
        if (session) q.session(session);
        const order = await q;
        if (!order) return { success: false, message: 'Order not found' };

        try {
            await orderLifecycleService.handleReturnDecision(order, itemId, adminId, decisionPayload, session);
            const msg = decisionPayload.decision === 'approve' ? 'Return approved & stock restored' : 'Return rejected — item reverted to Delivered';
            return { success: true, message: msg };
        } catch (err) {
            return { success: false, message: err.message };
        }
    });
};

