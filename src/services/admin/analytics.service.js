import Order from '../../model/orderModel.js';
import WalletTransaction from '../../model/walletTransactionModel.js';
import Product from '../../model/productModel.js';

const getDateRange = (filter, customFrom, customTo) => {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (filter === 'custom' && customFrom && customTo) {
        startDate = new Date(customFrom);
        endDate = new Date(customTo);
        endDate.setHours(23, 59, 59, 999);
    } else {
        switch (filter) {
            case 'today':
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'week':
                startDate.setDate(now.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(now.getMonth() - 1);
                break;
            case 'year':
                startDate.setFullYear(now.getFullYear() - 1);
                break;
            default:
                startDate = new Date(0); // All time
                break;
        }
    }
    return { startDate, endDate };
};

/**
 * Fetch top-level dashboard metrics securely via aggregation pipelines.
 */
export const getDashboardMetrics = async (filter = 'all', customFrom, customTo) => {
    const { startDate, endDate } = getDateRange(filter, customFrom, customTo);

    // 1. Order & Revenue Stats (Excluding Pending/Failed/Expired payments)
    const orderMatch = {
        createdAt: { $gte: startDate, $lte: endDate },
        orderStatus: { $nin: ['Payment Pending', 'Payment Failed', 'Expired'] }
    };

    const orderStatsArray = await Order.aggregate([
        { $match: orderMatch },
        { 
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: '$totalAmount' }, // Total final paid/expected amount
                totalCouponDiscount: { $sum: '$discount' }, // Coupon discount from snapshot
                totalOfferDiscount: { $sum: '$totalOfferDiscount' }, // Offer discount from snapshot
                deliveredCount: { 
                    $sum: { $cond: [{ $eq: ['$orderStatus', 'Delivered'] }, 1, 0] } 
                },
                cancelledCount: { 
                    $sum: { $cond: [{ $eq: ['$orderStatus', 'Cancelled'] }, 1, 0] } 
                },
                returnedCount: { 
                    $sum: { $cond: [{ $eq: ['$orderStatus', 'Returned'] }, 1, 0] } 
                }
            }
        }
    ]);

    const orderStats = orderStatsArray[0] || {
        totalOrders: 0, totalRevenue: 0, totalCouponDiscount: 0, 
        totalOfferDiscount: 0, deliveredCount: 0, cancelledCount: 0, returnedCount: 0
    };

    // 2. Refund Stats (from Immutable WalletTransactions)
    const refundMatch = {
        createdAt: { $gte: startDate, $lte: endDate },
        type: 'Credit',
        description: { $regex: /Refund/i },
        status: 'Completed'
    };

    const refundStatsArray = await WalletTransaction.aggregate([
        { $match: refundMatch },
        {
            $group: {
                _id: null,
                totalRefunded: { $sum: '$amount' },
                refundCount: { $sum: 1 }
            }
        }
    ]);

    const refundStats = refundStatsArray[0] || { totalRefunded: 0, refundCount: 0 };

    // Net Revenue = Total Valid Revenue - Refunds Issued
    const netRevenue = orderStats.totalRevenue - refundStats.totalRefunded;

    // Rates
    const cancellationRate = orderStats.totalOrders > 0 
        ? ((orderStats.cancelledCount / orderStats.totalOrders) * 100).toFixed(1) 
        : 0;
    
    const returnRate = orderStats.totalOrders > 0 
        ? ((orderStats.returnedCount / orderStats.totalOrders) * 100).toFixed(1) 
        : 0;

    return {
        revenue: {
            gross: orderStats.totalRevenue,
            net: netRevenue < 0 ? 0 : netRevenue,
            totalRefunded: refundStats.totalRefunded
        },
        discounts: {
            coupon: orderStats.totalCouponDiscount,
            offer: orderStats.totalOfferDiscount,
            total: orderStats.totalCouponDiscount + orderStats.totalOfferDiscount
        },
        orders: {
            total: orderStats.totalOrders,
            delivered: orderStats.deliveredCount,
            cancelled: orderStats.cancelledCount,
            returned: orderStats.returnedCount,
            cancellationRate,
            returnRate
        }
    };
};

/**
 * Fetch top selling products (by volume) based on order items.
 */
export const getTopSellingProducts = async (limit = 10) => {
    return Order.aggregate([
        { $match: { orderStatus: { $nin: ['Payment Pending', 'Payment Failed', 'Expired', 'Cancelled', 'Returned'] } } },
        { $unwind: '$items' },
        { $match: { 'items.itemStatus': { $nin: ['Cancelled', 'Returned'] } } },
        { 
            $group: { 
                _id: '$items.product', 
                totalSold: { $sum: '$items.quantity' },
                totalRevenue: { $sum: '$items.totalPrice' }
            }
        },
        { $sort: { totalSold: -1 } },
        { $limit: limit },
        {
            $lookup: {
                from: 'products',
                localField: '_id',
                foreignField: '_id',
                as: 'product'
            }
        },
        { $unwind: '$product' },
        {
            $project: {
                _id: 1,
                name: '$product.name',
                image: '$product.defaultImage',
                totalSold: 1,
                totalRevenue: 1
            }
        }
    ]);
};

/**
 * Time-series revenue report — supports daily/weekly/monthly/yearly.
 * Uses ONLY immutable snapshot totals. Never touches live pricing.
 * @param {'daily'|'weekly'|'monthly'|'yearly'} period
 * @param {Date} customFrom
 * @param {Date} customTo
 */
export const getRevenueTimeSeries = async (period = 'monthly', customFrom, customTo) => {
    const { startDate, endDate } = getDateRange(period, customFrom, customTo);

    const formatMap = {
        daily:   '%Y-%m-%d',
        weekly:  '%G-W%V',
        monthly: '%Y-%m',
        yearly:  '%Y',
    };
    const dateFormat = formatMap[period] || '%Y-%m';

    return Order.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate, $lte: endDate },
                orderStatus: { $nin: ['Payment Pending', 'Payment Failed', 'Expired'] }
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: dateFormat, date: '$createdAt', timezone: 'Asia/Kolkata' } },
                grossRevenue:      { $sum: '$totalAmount' },
                couponDiscount:    { $sum: '$discount' },
                offerDiscount:     { $sum: '$totalOfferDiscount' },
                orderCount:        { $sum: 1 },
                deliveredCount:    { $sum: { $cond: [{ $eq: ['$orderStatus', 'Delivered'] }, 1, 0] } },
                cancelledCount:    { $sum: { $cond: [{ $eq: ['$orderStatus', 'Cancelled'] }, 1, 0] } },
                returnedCount:     { $sum: { $cond: [{ $eq: ['$orderStatus', 'Returned'] }, 1, 0] } },
            }
        },
        { $sort: { _id: 1 } },
        {
            $project: {
                period: '$_id',
                grossRevenue: 1,
                netRevenue: { $subtract: ['$grossRevenue', { $add: ['$couponDiscount', '$offerDiscount'] }] },
                couponDiscount: 1,
                offerDiscount: 1,
                orderCount: 1,
                deliveredCount: 1,
                cancelledCount: 1,
                returnedCount: 1,
                _id: 0
            }
        }
    ]);
};

/**
 * Return analytics — breaks down returns by inspection outcome.
 * Identifies damaged / non-restockable loss metrics.
 */
export const getReturnAnalytics = async (filter = 'all', customFrom, customTo) => {
    const { startDate, endDate } = getDateRange(filter, customFrom, customTo);

    const result = await Order.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        { $unwind: '$items' },
        { $match: { 'items.itemStatus': { $in: ['Returned', 'Return Requested', 'Return Rejected'] } } },
        {
            $group: {
                _id: '$items.returnInspection.status',
                count:            { $sum: 1 },
                totalRefunded:    { $sum: { $cond: ['$items.refundProcessed', '$items.finalPriceAfterCoupon', 0] } },
                stockRestored:    { $sum: { $cond: ['$items.inventoryReconciled', 1, 0] } },
            }
        }
    ]);

    // Normalize into a consistent map
    const normalized = {
        approved:       { count: 0, totalRefunded: 0, stockRestored: 0 },
        rejected:       { count: 0, totalRefunded: 0, stockRestored: 0 },
        damaged:        { count: 0, totalRefunded: 0, stockRestored: 0 },
        nonRestockable: { count: 0, totalRefunded: 0, stockRestored: 0 },
        pending:        { count: 0, totalRefunded: 0, stockRestored: 0 },
    };

    const keyMap = {
        'Approved': 'approved', 'Restockable': 'approved',
        'Rejected': 'rejected', 'Non-Restockable': 'nonRestockable',
        'Damaged': 'damaged',   'Pending': 'pending'
    };

    for (const row of result) {
        const key = keyMap[row._id] || 'pending';
        normalized[key].count         += row.count;
        normalized[key].totalRefunded += row.totalRefunded;
        normalized[key].stockRestored += row.stockRestored;
    }

    return normalized;
};

/**
 * Coupon performance analytics from immutable order snapshots.
 * Returns per-coupon usage count and total discount amount.
 */
export const getCouponAnalytics = async (filter = 'all', customFrom, customTo) => {
    const { startDate, endDate } = getDateRange(filter, customFrom, customTo);

    return Order.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate, $lte: endDate },
                'couponApplied.code': { $exists: true, $ne: null },
                orderStatus: { $nin: ['Payment Pending', 'Payment Failed', 'Expired'] }
            }
        },
        {
            $group: {
                _id: '$couponApplied.code',
                usageCount:      { $sum: 1 },
                totalDiscount:   { $sum: '$couponApplied.discountAmount' },
                totalRevenue:    { $sum: '$totalAmount' },
            }
        },
        { $sort: { usageCount: -1 } },
        { $limit: 20 },
        {
            $project: {
                code: '$_id',
                usageCount: 1,
                totalDiscount: 1,
                totalRevenue: 1,
                avgDiscount: { $divide: ['$totalDiscount', '$usageCount'] },
                _id: 0
            }
        }
    ]);
};
