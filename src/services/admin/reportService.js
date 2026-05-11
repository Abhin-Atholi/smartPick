import mongoose from 'mongoose';
import Order from '../../model/orderModel.js';
import User from '../../model/userModel.js';

const validOrderStatuses = ['Delivered', 'Processing', 'Shipped', 'Out for Delivery', 'Return Rejected'];

// Helper to get date boundaries based on filter
const getDateFilter = (filter, customFrom, customTo) => {
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    switch (filter) {
        case 'Daily':
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'Weekly':
            const day = now.getDay();
            const diff = now.getDate() - day + (day === 0 ? -6 : 1);
            startDate = new Date(now.setDate(diff));
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'Monthly':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            break;
        case 'Yearly':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            break;
        case 'Custom':
            if (customFrom && customTo) {
                startDate = new Date(customFrom);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(customTo);
                endDate.setHours(23, 59, 59, 999);
            }
            break;
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            break;
    }

    return { startDate, endDate };
};

export const getSalesReportData = async (filter, customFrom, customTo) => {
    const { startDate, endDate } = getDateFilter(filter, customFrom, customTo);

    const matchStage = {
        createdAt: { $gte: startDate, $lte: endDate },
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

    const summary = summaryData.length > 0 ? summaryData[0] : {
        totalRevenue: 0,
        totalOrders: 0,
        totalDiscount: 0,
        productsSold: 0
    };

    // 2. Sales Chart (Daily/Hourly/Monthly based on range)
    let groupByFormat;
    const dayDiff = (endDate - startDate) / (1000 * 60 * 60 * 24);

    if (dayDiff <= 1) groupByFormat = "%H:00";
    else if (dayDiff <= 31) groupByFormat = "%d %b";
    else groupByFormat = "%b %Y";

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

    // 3. Order Breakdown List
    const orders = await Order.find(matchStage)
        .populate('user', 'fullName')
        .sort({ createdAt: -1 })
        .limit(100);

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
        couponUsage,
        period: { startDate, endDate }
    };
};
