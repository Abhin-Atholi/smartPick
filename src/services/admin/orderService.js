import Order from '../../model/orderModel.js';
import Product from '../../model/productModel.js';

// ── Status transition rules ──────────────────────────────────────────────────
const ALLOWED_TRANSITIONS = {
    'Processing': ['Shipped', 'Cancelled'],
    'Shipped':    ['Delivered', 'Cancelled'],
    'Delivered':  ['Return Requested'],
    'Return Requested': ['Returned', 'Delivered'],
    'Returned':   [],
    'Cancelled':  []
};

export const getAllOrders = async ({ page = 1, limit = 10, search = '', status = 'All', dateFrom = '', dateTo = '', sort = 'newest' } = {}) => {
    const skip = (page - 1) * limit;
    const query = {};

    // Status filter
    if (status && status !== 'All') query.orderStatus = status;

    // Date range filter
    if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            query.createdAt.$gte = from;
        }
        if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            query.createdAt.$lte = to;
        }
    }

    // Text search (orderId OR user name/email via lookup)
    let userMatchIds = [];
    if (search && search.trim()) {
        const term = search.trim();
        const User = (await import('../../model/userModel.js')).default;
        const matchedUsers = await User.find({
            $or: [
                { fullName: { $regex: term, $options: 'i' } },
                { email:    { $regex: term, $options: 'i' } }
            ]
        }, '_id').lean();
        userMatchIds = matchedUsers.map(u => u._id);

        query.$or = [
            { orderId: { $regex: term, $options: 'i' } },
            ...(userMatchIds.length ? [{ user: { $in: userMatchIds } }] : [])
        ];
    }

    // Sort
    const sortMap = {
        'newest':    { createdAt: -1 },
        'oldest':    { createdAt:  1 },
        'amount_desc': { totalAmount: -1 },
        'amount_asc':  { totalAmount:  1 }
    };
    const sortObj = sortMap[sort] || { createdAt: -1 };

    const [orders, totalOrders] = await Promise.all([
        Order.find(query)
            .populate('user', 'fullName email profileImage')
            .populate('items.product', 'name')
            .sort(sortObj)
            .skip(skip)
            .limit(limit)
            .lean(),
        Order.countDocuments(query)
    ]);

    // Summary stats (always unfiltered)
    const [totalAll, pendingCount, deliveredToday, returnsCount] = await Promise.all([
        Order.countDocuments({}),
        Order.countDocuments({ orderStatus: 'Processing' }),
        Order.countDocuments({
            orderStatus: 'Delivered',
            updatedAt: { $gte: new Date(new Date().setHours(0,0,0,0)) }
        }),
        Order.countDocuments({ orderStatus: { $in: ['Return Requested', 'Returned'] } })
    ]);

    return {
        orders,
        totalOrders,
        totalPages: Math.ceil(totalOrders / limit),
        currentPage: page,
        stats: { totalAll, pendingCount, deliveredToday, returnsCount }
    };
};

export const getOrderByIdAdmin = async (orderId) => {
    return Order.findById(orderId)
        .populate('user', 'fullName email profileImage phone')
        .populate({ path: 'items.product', populate: { path: 'category', select: 'name' } })
        .lean();
};

export const updateOrderStatus = async (orderId, newStatus) => {
    const order = await Order.findById(orderId);
    if (!order) return { success: false, message: 'Order not found' };

    const allowed = ALLOWED_TRANSITIONS[order.orderStatus] || [];
    if (!allowed.includes(newStatus)) {
        return {
            success: false,
            message: `Cannot transition from "${order.orderStatus}" to "${newStatus}"`
        };
    }

    // If cancelling — restore stock for all non-cancelled items
    if (newStatus === 'Cancelled') {
        for (const item of order.items) {
            if (item.itemStatus !== 'Cancelled' && item.itemStatus !== 'Returned') {
                await Product.updateOne(
                    { _id: item.product },
                    { $inc: { 'variants.$[v].stock': item.quantity } },
                    { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
                );
                item.itemStatus = 'Cancelled';
            }
        }
    } else {
        // Sync item statuses to match order status
        const itemStatusMap = {
            'Shipped':          'Shipped',
            'Delivered':        'Delivered',
            'Return Requested': 'Return Requested',
            'Returned':         'Returned'
        };
        if (itemStatusMap[newStatus]) {
            order.items.forEach(item => {
                if (item.itemStatus !== 'Cancelled' && item.itemStatus !== 'Returned') {
                    item.itemStatus = itemStatusMap[newStatus];
                }
            });
        }
    }

    order.orderStatus = newStatus;
    if (newStatus === 'Delivered') order.paymentStatus = 'Paid';
    await order.save();

    return { success: true, message: `Order status updated to "${newStatus}"` };
};
