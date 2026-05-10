import Order from '../../model/orderModel.js';
import Product from '../../model/productModel.js';
import Wallet from '../../model/walletModel.js';
import * as taxHelper from '../../utils/taxHelper.js';

const processRefund = async (userId, amount, description, orderId) => {
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) wallet = new Wallet({ userId, balance: 0, transactions: [] });
    wallet.balance += amount;
    wallet.transactions.push({ type: 'Credit', amount, description, orderId });
    await wallet.save();
};

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

// ── Helper: restore stock for one item ───────────────────────────────────────
const restoreStock = (item) =>
    Product.updateOne(
        { _id: item.product },
        { $inc: { 'variants.$[v].stock': item.quantity } },
        { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
    );

// ── Order listing with search / filter / sort / pagination ───────────────────
export const getAllOrders = async ({
    page = 1, limit = 10, search = '',
    status = 'All', dateFrom = '', dateTo = '', sort = 'newest'
} = {}) => {
    const skip = (page - 1) * limit;
    const query = {};

    if (status && status !== 'All') query.orderStatus = status;

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
        newest: { createdAt: -1 }, oldest: { createdAt: 1 },
        amount_desc: { totalAmount: -1 }, amount_asc: { totalAmount: 1 }
    };

    const [orders, totalOrders] = await Promise.all([
        Order.find(query)
            .populate('user', 'fullName email profileImage')
            .populate('items.product', 'name')
            .sort(sortMap[sort] || { createdAt: -1 })
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

    // Status counts
    const statusCountsAgg = await Order.aggregate([
        { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
    ]);
    
    const statsObj = {
        Processing: 0, Shipped: 0, 'Out for Delivery': 0, 
        Cancelled: 0, 'Return Requested': 0, Returned: 0,
        Delivered: 0, totalAll: 0
    };
    
    statusCountsAgg.forEach(s => {
        if (s._id in statsObj) statsObj[s._id] = s.count;
        statsObj.totalAll += s.count;
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
            returnRequestCount: statsObj['Return Requested'],
            returnedCount: statsObj.Returned,
            deliveredProductsCount,
            cancelledReturnedCount
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
export const updateOrderStatus = async (orderId, newStatus) => {
    const order = await Order.findById(orderId);
    if (!order) return { success: false, message: 'Order not found' };

    const allowed = ALLOWED_TRANSITIONS[order.orderStatus] || [];
    if (!allowed.includes(newStatus)) {
        return { success: false, message: `Cannot move from "${order.orderStatus}" → "${newStatus}"` };
    }

    if (newStatus === 'Cancelled') {
        for (const item of order.items) {
            if (!['Cancelled','Returned'].includes(item.itemStatus)) {
                await restoreStock(item);
                item.itemStatus = 'Cancelled';
            }
        }
        if (order.paymentStatus === 'Paid') {
            order.paymentStatus = 'Refunded';
            await processRefund(order.user, order.totalAmount, `Refund for admin-cancelled Order ${order.orderId}`, orderId);
        }
    } else {
        const syncMap = { Shipped: 'Shipped', 'Out for Delivery': 'Out for Delivery', Delivered: 'Delivered' };
        if (syncMap[newStatus]) {
            order.items.forEach(item => {
                if (!['Cancelled','Returned', 'Return Rejected'].includes(item.itemStatus)) item.itemStatus = syncMap[newStatus];
            });
        }
    }

    order.orderStatus = newStatus;
    if (newStatus === 'Delivered') order.paymentStatus = 'Paid';
    await order.save();
    return { success: true, message: `Status updated to "${newStatus}"` };
};

// ── Cancel a single item (admin) ──────────────────────────────────────────────
export const cancelOrderItem = async (orderId, itemId) => {
    const order = await Order.findById(orderId);
    if (!order) return { success: false, message: 'Order not found' };

    const item = order.items.id(itemId);
    if (!item) return { success: false, message: 'Item not found' };
    if (['Cancelled','Returned', 'Return Rejected', 'Shipped', 'Out for Delivery', 'Delivered'].includes(item.itemStatus)) {
        return { success: false, message: `Item cannot be cancelled because it is ${item.itemStatus}` };
    }

    await restoreStock(item);
    item.itemStatus = 'Cancelled';

    // Auto-cancel whole order if all items are now cancelled/returned
    const active = order.items.filter(i => !['Cancelled','Returned'].includes(i.itemStatus));
    if (active.length === 0) order.orderStatus = 'Cancelled';

    if (order.paymentStatus === 'Paid') {
        const taxableAmount = taxHelper.calculateTaxableAmount(order.subtotal, order.discount || 0);
        const itemTaxRefund = taxHelper.calculateRefundTax(item.totalPrice, order.tax || 0, taxableAmount);
        const refundAmount = item.totalPrice + itemTaxRefund;
        await processRefund(order.user, refundAmount, `Refund for admin-cancelled item in Order ${order.orderId}`, orderId);
        if (order.orderStatus === 'Cancelled') order.paymentStatus = 'Refunded';
    }

    await order.save();
    return { success: true, message: 'Item cancelled and stock restored' };
};

// ── Return requests listing ───────────────────────────────────────────────────
export const getReturnRequests = async ({ page = 1, limit = 10 } = {}) => {
    const query = {
        $or: [
            { orderStatus: 'Return Requested' },
            { 'items.itemStatus': 'Return Requested' }
        ]
    };
    const [orders, total] = await Promise.all([
        Order.find(query)
            .populate('user', 'fullName email profileImage')
            .populate('items.product', 'name variants')
            .sort({ updatedAt: -1 })
            .skip((page - 1) * limit).limit(limit).lean(),
        Order.countDocuments(query)
    ]);
    return { orders, total, totalPages: Math.ceil(total / limit), currentPage: page };
};

// ── Approve or reject a return request (per item) ─────────────────────────────
export const handleReturnDecision = async (orderId, itemId, decision) => {
    const order = await Order.findById(orderId);
    if (!order) return { success: false, message: 'Order not found' };

    const item = order.items.id(itemId);
    if (!item) return { success: false, message: 'Item not found' };
    if (item.itemStatus !== 'Return Requested') {
        return { success: false, message: 'No pending return request for this item' };
    }

    if (decision === 'approve') {
        await restoreStock(item);
        item.itemStatus = 'Returned';
        // If all returnable items are now returned/cancelled, mark order Returned
        const nonReturned = order.items.filter(i => !['Returned','Cancelled', 'Return Rejected'].includes(i.itemStatus));
        if (nonReturned.length === 0) order.orderStatus = 'Returned';

        if (order.paymentStatus === 'Paid') {
            const taxableAmount = taxHelper.calculateTaxableAmount(order.subtotal, order.discount || 0);
            const itemTaxRefund = taxHelper.calculateRefundTax(item.totalPrice, order.tax || 0, taxableAmount);
            const refundAmount = item.totalPrice + itemTaxRefund;
            await processRefund(order.user, refundAmount, `Refund for returned item in Order ${order.orderId}`, orderId);
            if (order.orderStatus === 'Returned') order.paymentStatus = 'Refunded';
        }
    } else {
        item.itemStatus = 'Return Rejected';
        // Mark order as Return Rejected if it was requested at order level
        if (order.orderStatus === 'Return Requested') {
            order.orderStatus = 'Return Rejected';
        }
    }

    await order.save();
    const msg = decision === 'approve' ? 'Return approved & stock restored' : 'Return rejected — item reverted to Delivered';
    return { success: true, message: msg };
};
