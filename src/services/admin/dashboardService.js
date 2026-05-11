import mongoose from 'mongoose';
import Order from '../../model/orderModel.js';
import User from '../../model/userModel.js';
import Product from '../../model/productModel.js';
import Category from '../../model/categoryModel.js';
import Subcategory from '../../model/subcategoryModel.js';

const validOrderStatuses = ['Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Return Requested', 'Return Rejected'];

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
            // Default to Yearly if unknown
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
            break;
    }

    return { startDate, endDate };
};

export const getDashboardData = async (filter, customFrom, customTo) => {
    const { startDate, endDate } = getDateFilter(filter, customFrom, customTo);

    const matchStage = {
        createdAt: { $gte: startDate, $lte: endDate },
        orderStatus: { $in: validOrderStatuses }
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

    const totalCustomers = await User.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } });
    
    const summary = summaryData.length > 0 ? {
        totalRevenue: summaryData[0].totalRevenue,
        totalOrders: summaryData[0].totalOrders,
        totalCustomers: summaryData[0].uniqueCustomers.length, // or use totalCustomers
        averageOrderValue: summaryData[0].totalRevenue / summaryData[0].totalOrders
    } : { totalRevenue: 0, totalOrders: 0, totalCustomers: 0, averageOrderValue: 0 };

    summary.totalNewUsers = totalCustomers;

    // 2. Sales Chart Data
    let groupByFormat;
    switch (filter) {
        case 'Daily': groupByFormat = "%H:00"; break; // Group by hour
        case 'Weekly': groupByFormat = "%Y-%m-%d"; break; // Group by day
        case 'Monthly': groupByFormat = "%Y-%m-%d"; break; // Group by day
        case 'Yearly': groupByFormat = "%Y-%m"; break; // Group by month
        case 'Custom': groupByFormat = "%Y-%m-%d"; break;
        default: groupByFormat = "%Y-%m"; break;
    }

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
        topSubcategories
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
