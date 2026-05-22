/**
 * financialAnalytics.service.js
 *
 * THE SINGLE SOURCE OF ANALYTICS TRUTH for SmartPick.
 *
 * Financial layers:
 *   GROSS   = SUM(order.totalAmount)            — original purchase value
 *   REFUNDS = SUM(order.totalRefundedAmount)     — money returned to customers
 *   NET     = SUM(order.activeTotal)             — actual retained money (primary KPI)
 *
 * All top-selling / category / brand analytics use item-level truth,
 * filtering out Cancelled and Returned items.
 *
 * DO NOT call raw Order.aggregate outside this service for financial purposes.
 */

import Order from '../../model/orderModel.js';
import User from '../../model/userModel.js';
import { getDateRange, getPreviousDateRange, getGroupByFormat } from '../../utils/dateFilterHelper.js';

// ── Shared match helpers ──────────────────────────────────────────────────────

/** Orders with a completed payment (not pre-payment noise) */
const paidOrderMatch = (startDate, endDate) => ({
    createdAt: { $gte: startDate, $lte: endDate },
    paymentStatus: { $in: ['Paid', 'Refunded'] }
});

/** Item statuses that represent active (non-refunded) sales */
const ACTIVE_ITEM_STATUSES  = ['Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Return Requested', 'Return Rejected'];
/** Item statuses that have been refunded to the customer */
const REFUNDED_ITEM_STATUSES = ['Cancelled', 'Returned'];

// ── PHASE 1: Core Financial KPIs ──────────────────────────────────────────────

/**
 * Primary financial metrics block.
 * Returns gross, net, refunds, and all order lifecycle counts.
 *
 * @param {string} filter     - Daily | Weekly | Monthly | Yearly | Custom
 * @param {string} customFrom
 * @param {string} customTo
 */
export const getFinancialKPIs = async (filter = 'Monthly', customFrom, customTo) => {
    const { startDate, endDate }           = getDateRange(filter, customFrom, customTo);
    const { startDate: prevStart, endDate: prevEnd } = getPreviousDateRange(filter, startDate, endDate);

    const matchCurrent  = paidOrderMatch(startDate, endDate);
    const matchPrevious = paidOrderMatch(prevStart, prevEnd);

    // ── Current period aggregation ───────────────────────────────────────────
    const [current, previous, customerCount, returnLiability] = await Promise.all([

        // Current period financials
        Order.aggregate([
            { $match: matchCurrent },
            {
                $group: {
                    _id: null,
                    grossRevenue:      { $sum: '$totalAmount' },
                    netRevenue:        { $sum: { $ifNull: ['$activeTotal', '$totalAmount'] } },
                    totalRefunded:     { $sum: { $ifNull: ['$totalRefundedAmount', 0] } },
                    totalTax:          { $sum: '$tax' },
                    totalCouponLoss:   { $sum: '$discount' },
                    totalOfferLoss:    { $sum: { $ifNull: ['$totalOfferDiscount', 0] } },
                    totalOrders:       { $sum: 1 },
                    deliveredCount:    { $sum: { $cond: [{ $eq: ['$orderStatus', 'Delivered'] }, 1, 0] } },
                    cancelledCount:    { $sum: { $cond: [{ $in: ['$orderStatus', ['Cancelled', 'Partially Cancelled']] }, 1, 0] } },
                    returnedCount:     { $sum: { $cond: [{ $in: ['$orderStatus', ['Returned', 'Partially Returned']] }, 1, 0] } },
                    partialCount:      { $sum: { $cond: [{ $in: ['$orderStatus', ['Partially Cancelled', 'Partially Returned']] }, 1, 0] } },
                    pendingReturnCount: { $sum: { $cond: [{ $eq: ['$orderStatus', 'Return Requested'] }, 1, 0] } },
                    totalProductsSold: { $sum: { $sum: '$items.quantity' } }
                }
            }
        ]),

        // Previous period for growth comparison
        Order.aggregate([
            { $match: matchPrevious },
            {
                $group: {
                    _id: null,
                    grossRevenue: { $sum: '$totalAmount' },
                    netRevenue:   { $sum: { $ifNull: ['$activeTotal', '$totalAmount'] } },
                    totalOrders:  { $sum: 1 },
                    totalProductsSold: { $sum: { $sum: '$items.quantity' } }
                }
            }
        ]),

        // Active customers this period
        User.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, isBlocked: false }),

        // Pending refund liability: return-requested items not yet processed
        Order.aggregate([
            { $match: { ...matchCurrent, orderStatus: { $in: ['Return Requested', 'Partially Returned'] } } },
            { $unwind: '$items' },
            { $match: { 'items.itemStatus': 'Return Requested', 'items.refundProcessed': { $ne: true } } },
            {
                $group: {
                    _id: null,
                    pendingCount:  { $sum: 1 },
                    pendingAmount: { $sum: { $ifNull: ['$items.finalPriceAfterCoupon', '$items.totalPrice'] } }
                }
            }
        ])
    ]);

    const curr = current[0] || {
        grossRevenue: 0, netRevenue: 0, totalRefunded: 0, totalTax: 0,
        totalCouponLoss: 0, totalOfferLoss: 0, totalOrders: 0,
        deliveredCount: 0, cancelledCount: 0, returnedCount: 0,
        partialCount: 0, pendingReturnCount: 0, totalProductsSold: 0
    };
    const prev = previous[0] || { grossRevenue: 0, netRevenue: 0, totalOrders: 0, totalProductsSold: 0 };
    const liability = returnLiability[0] || { pendingCount: 0, pendingAmount: 0 };

    const avgOrderValue = curr.totalOrders > 0 ? curr.netRevenue / curr.totalOrders : 0;
    const cancellationRate = curr.totalOrders > 0
        ? ((curr.cancelledCount / curr.totalOrders) * 100).toFixed(1) : 0;
    const returnRate = curr.totalOrders > 0
        ? ((curr.returnedCount / curr.totalOrders) * 100).toFixed(1) : 0;

    // Growth %
    const pct = (curr, prev) => prev === 0 ? (curr > 0 ? 100 : 0) : (((curr - prev) / prev) * 100).toFixed(1);

    return {
        period: { startDate, endDate, filter },
        revenue: {
            gross:           curr.grossRevenue,
            net:             curr.netRevenue,
            totalRefunded:   curr.totalRefunded,
            tax:             curr.totalTax,
            couponLoss:      curr.totalCouponLoss,
            offerLoss:       curr.totalOfferLoss,
            totalDiscountLoss: curr.totalCouponLoss + curr.totalOfferLoss,
        },
        orders: {
            total:            curr.totalOrders,
            delivered:        curr.deliveredCount,
            cancelled:        curr.cancelledCount,
            returned:         curr.returnedCount,
            partial:          curr.partialCount,
            pendingReturns:   curr.pendingReturnCount,
            productsSold:     curr.totalProductsSold,
            cancellationRate: Number(cancellationRate),
            returnRate:       Number(returnRate),
            avgOrderValue
        },
        customers: {
            newThisPeriod: customerCount
        },
        liability: {
            pendingReturnItems:  liability.pendingCount,
            pendingRefundAmount: liability.pendingAmount
        },
        growth: {
            grossRevenue: Number(pct(curr.grossRevenue, prev.grossRevenue)),
            netRevenue:   Number(pct(curr.netRevenue, prev.netRevenue)),
            orders:       Number(pct(curr.totalOrders, prev.totalOrders)),
            productsSold: Number(pct(curr.totalProductsSold, prev.totalProductsSold))
        }
    };
};

// ── PHASE 2: Revenue Trend Chart ──────────────────────────────────────────────

/**
 * Time-series for the Revenue Trend Chart.
 * Returns three parallel arrays: gross, net, refunds — per time bucket.
 */
export const getRevenueTrend = async (filter = 'Monthly', customFrom, customTo) => {
    const { startDate, endDate } = getDateRange(filter, customFrom, customTo);
    const groupByFormat = getGroupByFormat(filter, startDate, endDate);

    const rows = await Order.aggregate([
        { $match: paidOrderMatch(startDate, endDate) },
        {
            $group: {
                _id: { $dateToString: { format: groupByFormat, date: '$createdAt', timezone: 'Asia/Kolkata' } },
                gross:    { $sum: '$totalAmount' },
                net:      { $sum: { $ifNull: ['$activeTotal', '$totalAmount'] } },
                refunded: { $sum: { $ifNull: ['$totalRefundedAmount', 0] } },
                orders:   { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    return {
        labels:   rows.map(r => r._id),
        gross:    rows.map(r => r.gross),
        net:      rows.map(r => r.net),
        refunded: rows.map(r => r.refunded),
        orders:   rows.map(r => r.orders)
    };
};

// ── PHASE 3: Order Lifecycle Funnel ───────────────────────────────────────────

/**
 * Funnel data: Placed → Paid → Delivered → Returned → Cancelled
 */
export const getOrderFunnel = async (filter = 'Monthly', customFrom, customTo) => {
    const { startDate, endDate } = getDateRange(filter, customFrom, customTo);

    const [placed, paid, delivered, returned, cancelled] = await Promise.all([
        Order.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
        Order.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, paymentStatus: { $in: ['Paid', 'Refunded'] } }),
        Order.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, orderStatus: 'Delivered' }),
        Order.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, orderStatus: { $in: ['Returned', 'Partially Returned'] } }),
        Order.countDocuments({ createdAt: { $gte: startDate, $lte: endDate }, orderStatus: { $in: ['Cancelled', 'Partially Cancelled'] } })
    ]);

    return { placed, paid, delivered, returned, cancelled };
};

// ── PHASE 4: Top Performers (Item-Level Truth) ────────────────────────────────

/**
 * Top-selling products using ONLY active (non-refunded) items.
 * Revenue = sum of item.finalPriceAfterCoupon (falls back to totalPrice).
 */
export const getTopProducts = async (filter = 'Monthly', customFrom, customTo, limit = 10) => {
    const { startDate, endDate } = getDateRange(filter, customFrom, customTo);

    return Order.aggregate([
        { $match: paidOrderMatch(startDate, endDate) },
        { $unwind: '$items' },
        { $match: { 'items.itemStatus': { $in: ACTIVE_ITEM_STATUSES } } },
        {
            $group: {
                _id: '$items.product',
                totalQuantity: { $sum: '$items.quantity' },
                totalRevenue:  { $sum: { $ifNull: ['$items.finalPriceAfterCoupon', '$items.totalPrice'] } }
            }
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: limit },
        {
            $lookup: {
                from: 'products', localField: '_id', foreignField: '_id', as: 'productInfo'
            }
        },
        { $unwind: '$productInfo' },
        {
            $project: {
                _id: 1,
                name:  '$productInfo.name',
                image: { $arrayElemAt: [{ $arrayElemAt: ['$productInfo.colorOptions.images', 0] }, 0] },
                totalQuantity: 1,
                totalRevenue: 1
            }
        }
    ]);
};

/** Top categories by active item sales */
export const getTopCategories = async (filter = 'Monthly', customFrom, customTo, limit = 10) => {
    const { startDate, endDate } = getDateRange(filter, customFrom, customTo);

    return Order.aggregate([
        { $match: paidOrderMatch(startDate, endDate) },
        { $unwind: '$items' },
        { $match: { 'items.itemStatus': { $in: ACTIVE_ITEM_STATUSES } } },
        {
            $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'p' }
        },
        { $unwind: '$p' },
        {
            $group: {
                _id: '$p.category',
                totalQuantity: { $sum: '$items.quantity' },
                totalRevenue:  { $sum: { $ifNull: ['$items.finalPriceAfterCoupon', '$items.totalPrice'] } }
            }
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: limit },
        { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'cat' } },
        { $unwind: '$cat' },
        { $project: { _id: 1, name: '$cat.name', totalQuantity: 1, totalRevenue: 1 } }
    ]);
};

/** Top subcategories by active item sales */
export const getTopSubcategories = async (filter = 'Monthly', customFrom, customTo, limit = 10) => {
    const { startDate, endDate } = getDateRange(filter, customFrom, customTo);

    return Order.aggregate([
        { $match: paidOrderMatch(startDate, endDate) },
        { $unwind: '$items' },
        { $match: { 'items.itemStatus': { $in: ACTIVE_ITEM_STATUSES } } },
        { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'p' } },
        { $unwind: '$p' },
        {
            $group: {
                _id: '$p.subcategory',
                totalQuantity: { $sum: '$items.quantity' },
                totalRevenue:  { $sum: { $ifNull: ['$items.finalPriceAfterCoupon', '$items.totalPrice'] } }
            }
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: limit },
        { $lookup: { from: 'subcategories', localField: '_id', foreignField: '_id', as: 'sub' } },
        { $unwind: '$sub' },
        { $project: { _id: 1, name: '$sub.name', totalQuantity: 1, totalRevenue: 1 } }
    ]);
};

/** Top brands by active item sales */
export const getTopBrands = async (filter = 'Monthly', customFrom, customTo, limit = 10) => {
    const { startDate, endDate } = getDateRange(filter, customFrom, customTo);

    return Order.aggregate([
        { $match: paidOrderMatch(startDate, endDate) },
        { $unwind: '$items' },
        { $match: { 'items.itemStatus': { $in: ACTIVE_ITEM_STATUSES } } },
        { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'p' } },
        { $unwind: '$p' },
        {
            $group: {
                _id: '$p.brand',
                totalQuantity: { $sum: '$items.quantity' },
                totalRevenue:  { $sum: { $ifNull: ['$items.finalPriceAfterCoupon', '$items.totalPrice'] } }
            }
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: limit },
        { $project: { _id: 1, name: '$_id', totalQuantity: 1, totalRevenue: 1 } }
    ]);
};

// ── PHASE 5: Tax Analytics ────────────────────────────────────────────────────

/**
 * GST breakdown for a period.
 * Uses item.taxAmount snapshots (immutable).
 */
export const getTaxAnalytics = async (filter = 'Monthly', customFrom, customTo) => {
    const { startDate, endDate } = getDateRange(filter, customFrom, customTo);

    const result = await Order.aggregate([
        { $match: paidOrderMatch(startDate, endDate) },
        { $unwind: '$items' },
        {
            $group: {
                _id: null,
                taxCollected:  { $sum: { $cond: [{ $in: ['$items.itemStatus', ACTIVE_ITEM_STATUSES] }, '$items.taxAmount', 0] } },
                taxRefunded:   { $sum: { $cond: [{ $in: ['$items.itemStatus', REFUNDED_ITEM_STATUSES] }, '$items.taxAmount', 0] } },
            }
        }
    ]);

    const r = result[0] || { taxCollected: 0, taxRefunded: 0 };
    return {
        taxCollected:  r.taxCollected,
        taxRefunded:   r.taxRefunded,
        netTaxRetained: r.taxCollected - r.taxRefunded,
        cgst:  r.taxCollected / 2,
        sgst:  r.taxCollected / 2
    };
};

// ── PHASE 6: Coupon Analytics ─────────────────────────────────────────────────

export const getCouponAnalytics = async (filter = 'Monthly', customFrom, customTo) => {
    const { startDate, endDate } = getDateRange(filter, customFrom, customTo);

    return Order.aggregate([
        {
            $match: {
                ...paidOrderMatch(startDate, endDate),
                'couponApplied.code': { $exists: true, $ne: null }
            }
        },
        {
            $group: {
                _id:            '$couponApplied.code',
                usageCount:     { $sum: 1 },
                totalDiscount:  { $sum: '$discount' },
                totalRevenue:   { $sum: { $ifNull: ['$activeTotal', '$totalAmount'] } }
            }
        },
        { $sort: { usageCount: -1 } },
        { $limit: 20 },
        {
            $project: {
                code:          '$_id',
                usageCount:    1,
                totalDiscount: 1,
                totalRevenue:  1,
                avgDiscount:   { $divide: ['$totalDiscount', '$usageCount'] },
                _id: 0
            }
        }
    ]);
};

// ── PHASE 7: Full Order Ledger (for reports) ──────────────────────────────────

/**
 * Paginated order ledger for PDF/Excel reports.
 * Each row has gross, refunded, and net columns.
 */
export const getOrderLedger = async (filter = 'Monthly', customFrom, customTo, page = 1, limit = 50) => {
    const { startDate, endDate } = getDateRange(filter, customFrom, customTo);
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
        Order.find(paidOrderMatch(startDate, endDate))
            .populate('user', 'fullName email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Order.countDocuments(paidOrderMatch(startDate, endDate))
    ]);

    const rows = orders.map(o => ({
        orderId:         o.orderId || o._id.toString().slice(-8).toUpperCase(),
        date:            o.createdAt,
        customer:        o.user?.fullName || 'N/A',
        email:           o.user?.email || '',
        orderStatus:     o.orderStatus,
        paymentMethod:   o.paymentMethod,
        grossAmount:     o.totalAmount,
        refundedAmount:  o.totalRefundedAmount || 0,
        netRetained:     o.activeTotal ?? o.totalAmount,
        couponDiscount:  o.discount || 0,
        offerDiscount:   o.totalOfferDiscount || 0,
        tax:             o.tax || 0,
        itemCount:       o.items?.length || 0,
    }));

    return { rows, total, page, limit, pages: Math.ceil(total / limit) };
};

/**
 * Flattened item ledger for the Items sheet in Excel exports.
 */
export const getItemLedger = async (filter = 'Monthly', customFrom, customTo) => {
    const { startDate, endDate } = getDateRange(filter, customFrom, customTo);

    const orders = await Order.find(paidOrderMatch(startDate, endDate))
        .populate('items.product', 'name')
        .lean();

    const rows = [];
    for (const order of orders) {
        const orderId = order.orderId || order._id.toString().slice(-8).toUpperCase();
        for (const item of order.items || []) {
            rows.push({
                orderId,
                date:            order.createdAt,
                product:         item.product?.name || 'N/A',
                size:            item.size,
                color:           item.color,
                qty:             item.quantity,
                itemStatus:      item.itemStatus,
                finalPaid:       item.finalPriceAfterCoupon ?? item.totalPrice ?? 0,
                refunded:        item.refundProcessed ? (item.finalPriceAfterCoupon ?? item.totalPrice ?? 0) : 0,
                isRefunded:      !!item.refundProcessed,
                couponShare:     item.couponAllocated || 0,
                offerDiscount:   item.offerApplied?.discountAmount
                    ? item.offerApplied.discountAmount * item.quantity
                    : (item.discountAmount || 0),
                tax:             item.taxAmount || 0,
            });
        }
    }
    return rows;
};

// ── PHASE 8: Full Dashboard Bundle (single call for dashboardService) ─────────

/**
 * Assembles every piece of dashboard data in one parallelized call.
 * dashboard.service.js should call ONLY this.
 */
export const getFullDashboardBundle = async (filter = 'Monthly', customFrom, customTo) => {
    const [kpis, trend, funnel, topProducts, topCategories, topSubcategories, topBrands, recentOrders] =
        await Promise.all([
            getFinancialKPIs(filter, customFrom, customTo),
            getRevenueTrend(filter, customFrom, customTo),
            getOrderFunnel(filter, customFrom, customTo),
            getTopProducts(filter, customFrom, customTo),
            getTopCategories(filter, customFrom, customTo),
            getTopSubcategories(filter, customFrom, customTo),
            getTopBrands(filter, customFrom, customTo),
            // Recent 5 orders in the selected period
            Order.find(paidOrderMatch(
                getDateRange(filter, customFrom, customTo).startDate,
                getDateRange(filter, customFrom, customTo).endDate
            ))
                .populate('user', 'fullName')
                .sort({ createdAt: -1 })
                .limit(5)
                .lean()
        ]);

    return { kpis, trend, funnel, topProducts, topCategories, topSubcategories, topBrands, recentOrders };
};

