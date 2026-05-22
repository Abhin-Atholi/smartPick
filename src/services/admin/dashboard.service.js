/**
 * dashboard.service.js
 *
 * Thin orchestration layer — delegates ALL financial aggregation
 * to financialAnalytics.service.js (single source of truth).
 */

import Product from '../../model/productModel.js';
import { getFullDashboardBundle } from './financialAnalytics.service.js';

export const getDashboardData = async (filter = 'Monthly', customFrom, customTo) => {
    return getFullDashboardBundle(filter, customFrom, customTo);
};

export const getInventoryAlerts = async () => {
    const lowStockThreshold = 10;

    const [outOfStock, lowStock] = await Promise.all([
        Product.countDocuments({ 'variants.stock': { $eq: 0 } }),
        Product.countDocuments({ 'variants.stock': { $gt: 0, $lte: lowStockThreshold } })
    ]);

    return { outOfStock, lowStock };
};

