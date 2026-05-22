import mongoose from 'mongoose';
import Order from '../../model/orderModel.js';
import User from '../../model/userModel.js';

import { getDateRange, getPreviousDateRange, getGroupByFormat, validOrderStatuses } from '../../utils/dateFilterHelper.js';

export const getSalesReportData = async (filter, customFrom, customTo, page = 1, limit = 10) => {
    const { startDate, endDate } = getDateRange(filter, customFrom, customTo);
    const { startDate: prevStart, endDate: prevEnd } = getPreviousDateRange(filter, startDate, endDate);

    const matchStage = {
        createdAt: { $gte: startDate, $lte: endDate },
        orderStatus: { $in: validOrderStatuses },
        paymentStatus: { $nin: ['Failed', 'Expired'] }
    };

    const prevMatchStage = {
        createdAt: { $gte: prevStart, $lte: prevEnd },
        orderStatus: { $in: validOrderStatuses },
        paymentStatus: { $nin: ['Failed', 'Expired'] }
    };

    // 1. Summary Analytics
    const summaryData = await Order.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: '$totalAmount' },
                totalOrders: { $sum: 1 },
                totalDiscount: { $sum: { $add: ['$discount', '$totalOfferDiscount'] } },
                productsSold: { $sum: { $sum: '$items.quantity' } }
            }
        }
    ]);

    const prevSummaryData = await Order.aggregate([
        { $match: prevMatchStage },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: '$totalAmount' },
                totalOrders: { $sum: 1 },
                totalDiscount: { $sum: { $add: ['$discount', '$totalOfferDiscount'] } },
                productsSold: { $sum: { $sum: '$items.quantity' } }
            }
        }
    ]);

    const summary = summaryData.length > 0 ? summaryData[0] : {
        totalRevenue: 0,
        totalOrders: 0,
        totalDiscount: 0,
        productsSold: 0
    };

    const prevSummary = prevSummaryData.length > 0 ? prevSummaryData[0] : {
        totalRevenue: 0,
        totalOrders: 0,
        totalDiscount: 0,
        productsSold: 0
    };

    // Calculate growth
    const calcGrowth = (curr, prev) => prev === 0 ? 100 : ((curr - prev) / prev) * 100;

    summary.revenueGrowth = calcGrowth(summary.totalRevenue, prevSummary.totalRevenue);
    summary.orderGrowth = calcGrowth(summary.totalOrders, prevSummary.totalOrders);
    summary.productsGrowth = calcGrowth(summary.productsSold, prevSummary.productsSold);
    summary.discountGrowth = calcGrowth(summary.totalDiscount, prevSummary.totalDiscount);

    // 2. Sales Chart (Daily/Hourly/Monthly based on range)
    const groupByFormat = getGroupByFormat(filter, startDate, endDate);

    const chartData = await Order.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: { $dateToString: { format: groupByFormat, date: "$createdAt", timezone: "Asia/Kolkata" } },
                revenue: { $sum: "$totalAmount" },
                orders: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    // 3. Order Breakdown List with Pagination
    const skip = (page - 1) * limit;
    const orders = await Order.find(matchStage)
        .populate('user', 'fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

    const totalOrdersCount = await Order.countDocuments(matchStage);

    // 4. Coupon Usage
    const couponUsage = await Order.aggregate([
        { $match: { ...matchStage, 'couponApplied.code': { $exists: true, $ne: null } } },
        {
            $group: {
                _id: '$couponApplied.code',
                usageCount: { $sum: 1 },
                totalDiscount: { $sum: '$couponApplied.discountAmount' },
                discountType: { $first: '$couponApplied.discountType' }
            }
        },
        { $sort: { usageCount: -1 } }
    ]);

    return {
        summary,
        chart: {
            labels: chartData.map(d => d._id),
            revenue: chartData.map(d => d.revenue),
            orders: chartData.map(d => d.orders)
        },
        orders,
        totalOrdersCount,
        totalPages: Math.ceil(totalOrdersCount / limit),
        currentPage: page,
        couponUsage,
        period: { startDate, endDate }
    };
};
