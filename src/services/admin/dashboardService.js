import mongoose from 'mongoose';
import Order from '../../model/orderModel.js';
import User from '../../model/userModel.js';
import Product from '../../model/productModel.js';
import Category from '../../model/categoryModel.js';
import Subcategory from '../../model/subcategoryModel.js';

import { getDateRange, getPreviousDateRange, getGroupByFormat, validOrderStatuses } from '../../utils/dateFilterHelper.js';

export const getDashboardData = async (filter, customFrom, customTo) => {
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

    // 1. Summary Cards
    const summaryData = await Order.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: '$totalAmount' },
                totalOrders: { $sum: 1 },
                uniqueCustomers: { $addToSet: '$user' }
            }
        }
    ]);

    const prevSummaryData = await Order.aggregate([
        { $match: prevMatchStage },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: '$totalAmount' },
                totalOrders: { $sum: 1 }
            }
        }
    ]);

    const totalCustomers = await User.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } });
    
    const summary = summaryData.length > 0 ? {
        totalRevenue: summaryData[0].totalRevenue,
        totalOrders: summaryData[0].totalOrders,
        totalCustomers: summaryData[0].uniqueCustomers.length,
        averageOrderValue: summaryData[0].totalRevenue / summaryData[0].totalOrders
    } : { totalRevenue: 0, totalOrders: 0, totalCustomers: 0, averageOrderValue: 0 };

    // Calculate growth
    const prevRevenue = prevSummaryData.length > 0 ? prevSummaryData[0].totalRevenue : 0;
    const prevOrders = prevSummaryData.length > 0 ? prevSummaryData[0].totalOrders : 0;

    summary.revenueGrowth = prevRevenue === 0 ? 100 : ((summary.totalRevenue - prevRevenue) / prevRevenue) * 100;
    summary.orderGrowth = prevOrders === 0 ? 100 : ((summary.totalOrders - prevOrders) / prevOrders) * 100;
    summary.totalNewUsers = totalCustomers;

    // 2. Sales Chart Data
    const groupByFormat = getGroupByFormat(filter, startDate, endDate);

    const salesChart = await Order.aggregate([
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

    // Format chart labels and data
    const chartLabels = salesChart.map(item => item._id);
    const chartRevenue = salesChart.map(item => item.revenue);
    const chartOrders = salesChart.map(item => item.orders);

    // 3. Best Selling Products (Top 10)
    const topProducts = await Order.aggregate([
        { $match: matchStage },
        { $unwind: "$items" },
        { $match: { "items.itemStatus": { $in: validOrderStatuses } } },
        {
            $group: {
                _id: "$items.product",
                totalQuantity: { $sum: "$items.quantity" },
                totalRevenue: { $sum: "$items.totalPrice" }
            }
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: 10 },
        {
            $lookup: {
                from: 'products',
                localField: '_id',
                foreignField: '_id',
                as: 'productInfo'
            }
        },
        { $unwind: "$productInfo" },
        {
            $project: {
                _id: 1,
                name: "$productInfo.name",
                image: { $arrayElemAt: ["$productInfo.images", 0] },
                totalQuantity: 1,
                totalRevenue: 1
            }
        }
    ]);

    // 4. Best Selling Categories (Top 10)
    const topCategories = await Order.aggregate([
        { $match: matchStage },
        { $unwind: "$items" },
        { $match: { "items.itemStatus": { $in: validOrderStatuses } } },
        {
            $lookup: {
                from: 'products',
                localField: 'items.product',
                foreignField: '_id',
                as: 'productInfo'
            }
        },
        { $unwind: "$productInfo" },
        {
            $group: {
                _id: "$productInfo.category",
                totalQuantity: { $sum: "$items.quantity" },
                totalRevenue: { $sum: "$items.totalPrice" }
            }
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: 10 },
        {
            $lookup: {
                from: 'categories',
                localField: '_id',
                foreignField: '_id',
                as: 'categoryInfo'
            }
        },
        { $unwind: "$categoryInfo" },
        {
            $project: {
                _id: 1,
                name: "$categoryInfo.name",
                totalQuantity: 1,
                totalRevenue: 1
            }
        }
    ]);

    // 5. Best Selling Brands (Top 10)
    const topBrands = await Order.aggregate([
        { $match: matchStage },
        { $unwind: "$items" },
        { $match: { "items.itemStatus": { $in: validOrderStatuses } } },
        {
            $lookup: {
                from: 'products',
                localField: 'items.product',
                foreignField: '_id',
                as: 'productInfo'
            }
        },
        { $unwind: "$productInfo" },
        {
            $group: {
                _id: "$productInfo.brand",
                totalQuantity: { $sum: "$items.quantity" },
                totalRevenue: { $sum: "$items.totalPrice" }
            }
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: 10 },
        {
            $project: {
                _id: 1,
                name: "$_id", // Brand is a string field on product
                totalQuantity: 1,
                totalRevenue: 1
            }
        }
    ]);

    // 6. Best Selling Subcategories (Top 10)
    const topSubcategories = await Order.aggregate([
        { $match: matchStage },
        { $unwind: "$items" },
        { $match: { "items.itemStatus": { $in: validOrderStatuses } } },
        {
            $lookup: {
                from: 'products',
                localField: 'items.product',
                foreignField: '_id',
                as: 'productInfo'
            }
        },
        { $unwind: "$productInfo" },
        {
            $group: {
                _id: "$productInfo.subcategory",
                totalQuantity: { $sum: "$items.quantity" },
                totalRevenue: { $sum: "$items.totalPrice" }
            }
        },
        { $sort: { totalQuantity: -1 } },
        { $limit: 10 },
        {
            $lookup: {
                from: 'subcategories',
                localField: '_id',
                foreignField: '_id',
                as: 'subcategoryInfo'
            }
        },
        { $unwind: "$subcategoryInfo" },
        {
            $project: {
                _id: 1,
                name: "$subcategoryInfo.name",
                totalQuantity: 1,
                totalRevenue: 1
            }
        }
    ]);

    // 7. Recent Orders (Filtered by current range)
    const recentOrders = await Order.find(matchStage)
        .populate('user', 'fullName email')
        .sort({ createdAt: -1 })
        .limit(5);

    return {
        summary,
        chart: {
            labels: chartLabels,
            revenue: chartRevenue,
            orders: chartOrders
        },
        topProducts,
        topCategories,
        topBrands,
        topSubcategories,
        recentOrders
    };
};

export const getInventoryAlerts = async () => {
    const lowStockThreshold = 10;
    
    const outOfStock = await Product.countDocuments({ 'variants.stock': { $eq: 0 } });
    
    // Low stock is > 0 and <= threshold
    const lowStock = await Product.countDocuments({ 
        'variants.stock': { $gt: 0, $lte: lowStockThreshold } 
    });

    return {
        outOfStock,
        lowStock
    };
};
