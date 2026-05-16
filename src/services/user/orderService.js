import mongoose from 'mongoose';
import Order from '../../model/orderModel.js';
import Cart from '../../model/cartModel.js';
import Product from '../../model/productModel.js';
import Address from '../../model/addressModel.js';
import Wallet from '../../model/walletModel.js';
import Coupon from '../../model/couponModel.js';
import * as walletService from './walletService.js';
import * as offerHelper from '../../utils/offerHelper.js';
import * as taxHelper from '../../utils/taxHelper.js';
import cron from 'node-cron';
import * as refundService from '../common/refundService.js';
import * as orderLifecycleService from '../common/orderLifecycleService.js';
import { updateLedger } from '../common/financialLedgerService.js';
import { withTransaction, sessionOpts } from '../../utils/transactionHelper.js';
export const getOrderById = async (userId, orderId) => {
    const order = await Order.findOne({ _id: orderId, user: userId })
        .populate({ path: 'items.product', populate: { path: 'category' } });

    if (!order) return null;

    // Robust Expiry Check: If order is still pending/failed but retry window closed
    const isRzpPending = ['Payment Pending', 'Payment Failed'].includes(order.orderStatus);
    const hasExpiry = order.retryExpiresAt;

    if (isRzpPending && hasExpiry && new Date() > order.retryExpiresAt && !order.stockRestored) {
        const prevStatus = order.orderStatus;
        order.stockRestored = true;
        order.orderStatus = 'Expired';
        order.paymentStatus = 'Expired';
        for (const item of order.items) {
            item.itemStatus = 'Expired';
            const arrayFilter = item.variantId ? { 'v._id': item.variantId } : { 'v.size': item.size, 'v.color': item.color };
            await Product.updateOne(
                { _id: item.product },
                { $inc: { 'variants.$[v].stock': item.quantity } },
                { arrayFilters: [arrayFilter] }
            );
        }
        orderLifecycleService.appendSystemEvent(order, 'SYSTEM_EXPIRED_ORDER', prevStatus, 'Expired', 'Payment session expired during JIT lookup');
        updateLedger(order);
        await order.save();
    }

    return order;
};

import * as pricingService from '../common/pricingService.js';

export const placeOrder = async (userId, addressId, paymentMethod, couponData = null) => {
    return withTransaction(async (session) => {
        // 1. Fetch Cart
        const cartQuery = Cart.findOne({ user: userId }).populate('items.product');
        if (session) cartQuery.session(session);
        const cart = await cartQuery;
        if (!cart || cart.items.length === 0) {
            return { success: false, message: 'Your cart is empty' };
        }

        // 2. Fetch Address
        const addrQuery = Address.findOne({ _id: addressId, userId });
        if (session) addrQuery.session(session);
        const address = await addrQuery;
        if (!address) {
            return { success: false, message: 'Address not found' };
        }

        // 3. Pre-flight stock check & item building
        const affectedItems = [];
        const orderItems = [];

        for (const item of cart.items) {
            const product = item.product;
            if (!product || product.isDeleted || !product.isActive) {
                affectedItems.push({ name: product?.name || 'Unknown', reason: 'Product is unavailable' });
                continue;
            }
            let variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
            
            // Secondary Lookup: Fallback to size/color if ID lookup fails (Self-Healing during checkout)
            // This handles cases where admin edited the product and Regenerated variant IDs, 
            // but the cart DB still has the old ID.
            if (!variant && item.size && item.color) {
                variant = product.variants.find(v => 
                    v.size === item.size && 
                    (v.color === item.color || (v.color && v.color.name === item.color))
                );
                // Temporarily update the in-memory item so order generation and stock reduction use the NEW ID
                if (variant) {
                    item.variantId = variant._id;
                }
            }

            if (!variant) {
                affectedItems.push({ name: product.name, reason: `Requested variant not found` });
                continue;
            }
            if (variant.stock < item.quantity) {
                affectedItems.push({ name: product.name, reason: `Only ${variant.stock} unit(s) left (you need ${item.quantity})` });
                continue;
            }

            // Recalculate Offer using centralized pricing engine
            const categoryId = product.category?._id || product.category;
            const pricing = await offerHelper.getBestOffer(product._id, categoryId, variant.price) || {
                originalPrice: variant.price,
                finalPrice: variant.price,
                discountAmount: 0,
                appliedOffer: null
            };

            const itemTotal = pricing.finalPrice * item.quantity;

            orderItems.push({
                product: product._id,
                quantity: item.quantity,
                variantId: item.variantId,
                size: variant.size,
                color: variant.color,
                price: pricing.finalPrice,
                originalPrice: pricing.originalPrice,
                discountAmount: pricing.discountAmount,
                totalPrice: itemTotal,
                offerApplied: pricing.appliedOffer ? {
                    offerId: pricing.appliedOffer.offerId,
                    offerName: pricing.appliedOffer.name,
                    offerType: pricing.appliedOffer.offerType,
                    discountType: pricing.appliedOffer.discountType,
                    discountAmount: pricing.discountAmount * item.quantity
                } : undefined,
                itemStatus: (paymentMethod === 'Razorpay') ? 'Payment Pending' : 'Processing'
            });
        }

        if (affectedItems.length > 0) {
            return { success: false, message: 'Some items in your cart are no longer available', affectedItems };
        }

        // 4. Calculate Totals via Centralized Pricing Engine
        const pricingResult = pricingService.processPricing(orderItems, couponData);
        const breakdown = pricingResult.breakdown;
        const finalOrderItems = pricingResult.items;
        
        const totalAmount = breakdown.totalAmount;

        // 5. Initial Statuses
        let walletAmountUsed = 0;
        let finalPaymentStatus = 'Pending';
        let finalOrderStatus = (paymentMethod === 'Razorpay') ? 'Payment Pending' : 'Processing';

        // Handle Wallet logic early to check balance
        if (paymentMethod === 'Wallet') {
            const wallet = await walletService.getOrCreateWallet(userId, session);
            if (wallet.balance < totalAmount) {
                return { success: false, message: `Insufficient wallet balance. Available: ₹${wallet.balance.toFixed(2)}, Required: ₹${totalAmount.toFixed(2)}` };
            }
            walletAmountUsed = totalAmount;
            finalPaymentStatus = 'Paid';
        }

        // 6. Build order document
        const orderIdObj = new mongoose.Types.ObjectId();
        const order = new Order({
            _id: orderIdObj,
            orderId: `SP-${orderIdObj.toString().slice(-6).toUpperCase()}`,
            user: userId,
            items: finalOrderItems, // Use processed items from Pricing Engine
            shippingAddress: {
                fullName: address.fullName,
                phone: address.phone,
                addressLine1: `${address.house}, ${address.locality}, ${address.area}`,
                addressLine2: '',
                city: address.city,
                state: address.state,
                postalCode: address.pincode,
                country: address.country
            },
            // Phase 1: Map Standardized Breakdown to legacy schema fields
            originalSubtotal: breakdown.originalSubtotal,
            totalOfferDiscount: breakdown.offerDiscount,
            subtotal: breakdown.subtotal,
            shippingFee: breakdown.shippingFee,
            tax: breakdown.tax,
            discount: breakdown.couponDiscount,
            walletAmountUsed,
            totalAmount,
            paymentMethod,
            paymentStatus: finalPaymentStatus,
            orderStatus: finalOrderStatus,
            // Phase 9: Map Pricing Safety Flags
            pricingAdjusted: breakdown.pricingAdjusted,
            couponCapped: breakdown.couponCapped,

            couponApplied: couponData ? {
                code: couponData.code,
                discountAmount: breakdown.couponDiscount, 
                discountType: couponData.discountType
            } : undefined
        });

        // Ensure item-level flags are mapped correctly (already in finalOrderItems from pricingResult.items)
        order.items = finalOrderItems.map(i => ({
            ...i,
            isCapped: !!i.isCapped,
            isFloorHit: !!i.isFloorHit,
            pricingAdjusted: !!i.pricingAdjusted
        }));

        if (paymentMethod === 'Razorpay') {
            order.retryExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
            order.paymentDetails = {
                retryExpiryTime: new Date(Date.now() + 5 * 60 * 1000),
                failedAttempts: 0
            };
        }

        // 7. STOCK RESERVATION
        for (const item of orderItems) {
            const arrayFilter = item.variantId ? { 'v._id': item.variantId } : { 'v.size': item.size, 'v.color': item.color };
            await Product.updateOne(
                { _id: item.product },
                { $inc: { 'variants.$[v].stock': -item.quantity } },
                { arrayFilters: [arrayFilter], ...sessionOpts(session) }
            );
        }

        // 8. Wallet debit (Atomic)
        if (paymentMethod === 'Wallet' && walletAmountUsed > 0) {
            await walletService.debitWallet(
                userId,
                walletAmountUsed,
                `Order ${order.orderId} — Wallet Payment`,
                'Order Payment',
                order._id,
                session
            );
        }

        // 9. Finalize Order and Clear Cart
        updateLedger(order);
        await order.save(sessionOpts(session));
        cart.items = [];
        cart.cartTotal = 0;
        await cart.save(sessionOpts(session));

        // 10. Mark coupon used (Only for immediate payment methods)
        if (couponData?.code && (paymentMethod === 'Wallet' || paymentMethod === 'COD')) {
            await Coupon.updateOne(
                { code: couponData.code },
                { $inc: { usedCount: 1 }, $addToSet: { usedBy: userId } },
                sessionOpts(session)
            );
        }

        return { success: true, orderId: order._id, totalAmount: order.totalAmount };
    });
};

export const getOrders = async (userId, page = 1, limit = 5, filter = 'All', search = {}) => {
    const skip = (page - 1) * limit;
    const query = { user: userId, orderStatus: { $ne: 'Expired' } };

    if (filter && filter !== 'All') {
        if (filter === 'Processing') {
            query.orderStatus = { $in: ['Processing', 'Shipped', 'Out for Delivery'] };
        } else {
            query.orderStatus = filter;
        }
    }

    const { q, date } = search;

    if (q && q.trim()) {
        const term = q.trim();
        const orderIdCondition = { orderId: { $regex: term, $options: 'i' } };
        const matchingProducts = await Product.find({ name: { $regex: term, $options: 'i' } }, '_id').lean();
        const productIds = matchingProducts.map(p => p._id);
        const itemNameCondition = productIds.length > 0 ? { 'items.product': { $in: productIds } } : null;
        const orClauses = [orderIdCondition];
        if (itemNameCondition) orClauses.push(itemNameCondition);
        query.$or = orClauses;
    }

    if (date && date.trim()) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        query.createdAt = { $gte: start, $lte: end };
    }

    const [orders, totalOrders, statsArray] = await Promise.all([
        Order.find(query)
            .populate({ path: 'items.product', populate: { path: 'category' } })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Order.countDocuments(query),
        Order.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
        ])
    ]);

    // Robust Batch Expiry Check for the current page
    for (const order of orders) {
        const isRzpPending = ['Payment Pending', 'Payment Failed'].includes(order.orderStatus);
        const hasExpiry = order.retryExpiresAt;
        if (isRzpPending && hasExpiry && new Date() > order.retryExpiresAt && !order.stockRestored) {
            const prevStatus = order.orderStatus;
            order.stockRestored = true;
            order.orderStatus = 'Expired';
            order.paymentStatus = 'Expired';
            for (const item of order.items) {
                item.itemStatus = 'Expired';
                const arrayFilter = item.variantId ? { 'v._id': item.variantId } : { 'v.size': item.size, 'v.color': item.color };
                await Product.updateOne(
                    { _id: item.product },
                    { $inc: { 'variants.$[v].stock': item.quantity } },
                    { arrayFilters: [arrayFilter] }
                );
            }
            orderLifecycleService.appendSystemEvent(order, 'SYSTEM_EXPIRED_ORDER', prevStatus, 'Expired', 'Payment session expired during batch list lookup');
            updateLedger(order);
            await order.save();
        }
    }

    const stats = {
        Processing: 0, Shipped: 0, 'Out for Delivery': 0,
        Cancelled: 0, 'Return Requested': 0, Returned: 0, Delivered: 0, totalAll: 0
    };
    statsArray.forEach(s => {
        if (Object.prototype.hasOwnProperty.call(stats, s._id)) stats[s._id] = s.count;
        stats.totalAll += s.count;
    });

    return { orders, totalOrders, totalPages: Math.ceil(totalOrders / limit), currentPage: page, stats };
};

export const cancelOrder = async (userId, orderId, reason) => {
    return withTransaction(async (session) => {
        const orderQuery = Order.findOne({ _id: orderId, user: userId });
        if (session) orderQuery.session(session);
        const order = await orderQuery;
        if (!order) return { success: false, message: 'Order not found' };

        try {
            await orderLifecycleService.cancelOrder(order, userId, 'user', reason, session);
            return { success: true, message: 'Order cancelled successfully' };
        } catch (err) {
            return { success: false, message: err.message };
        }
    });
};

export const returnOrder = async (userId, orderId, reason) => {
    return withTransaction(async (session) => {
        const orderQuery = Order.findOne({ _id: orderId, user: userId });
        if (session) orderQuery.session(session);
        const order = await orderQuery;
        if (!order) return { success: false, message: 'Order not found' };

        try {
            let requestedCount = 0;
            for (const item of order.items) {
                if (item.itemStatus === 'Delivered') {
                    await orderLifecycleService.requestItemReturn(order, item._id, userId, reason, session);
                    requestedCount++;
                }
            }
            if (requestedCount === 0) return { success: false, message: 'No eligible delivered items to return' };
            return { success: true, message: 'Return requested successfully' };
        } catch (err) {
            return { success: false, message: err.message };
        }
    });
};

export const cancelOrderItem = async (userId, orderId, itemId, reason) => {
    return withTransaction(async (session) => {
        const orderQuery = Order.findOne({ _id: orderId, user: userId });
        if (session) orderQuery.session(session);
        const order = await orderQuery;
        if (!order) return { success: false, message: 'Order not found' };

        try {
            await orderLifecycleService.cancelOrderItem(order, itemId, userId, 'user', reason, session);
            return { success: true, message: 'Item cancelled successfully' };
        } catch (err) {
            return { success: false, message: err.message };
        }
    });
};

export const returnOrderItem = async (userId, orderId, itemId, reason) => {
    return withTransaction(async (session) => {
        const orderQuery = Order.findOne({ _id: orderId, user: userId });
        if (session) orderQuery.session(session);
        const order = await orderQuery;
        if (!order) return { success: false, message: 'Order not found' };

        try {
            await orderLifecycleService.requestItemReturn(order, itemId, userId, reason, session);
            return { success: true, message: 'Item return requested successfully' };
        } catch (err) {
            return { success: false, message: err.message };
        }
    });
};

export const checkPaymentStatus = async (userId, orderId) => {
    const order = await getOrderById(userId, orderId);
    if (!order) return { success: false, message: 'Order not found' };

    return {
        success: true,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        isExpired: order.orderStatus === 'Expired' || order.paymentStatus === 'Expired'
    };
};

// ── Background Cleanup Task ──────────────────────────────────────────────────
export const startStockCleanupTask = () => {
    console.log('📦 Cron: Order cleanup task initialized (Every 10m)');

    // This cron is for background cleanup of abandoned orders.
    // Real-time expiry is handled JIT in getOrderById and getOrders.
    cron.schedule('*/10 * * * *', async () => {
        try {
            const now = new Date();
            const expiredOrders = await Order.find({
                orderStatus: { $in: ['Payment Pending', 'Payment Failed'] },
                paymentStatus: { $ne: 'Paid' },
                stockRestored: false,
                retryExpiresAt: { $lt: now }
            }).populate('items.product');

            if (expiredOrders.length === 0) return;

            console.log(`🧹 Cron: Auto-restoring stock for ${expiredOrders.length} abandoned order(s)...`);

            for (const order of expiredOrders) {
                const prevStatus = order.orderStatus;
                order.stockRestored = true;
                order.orderStatus = 'Expired';
                order.paymentStatus = 'Expired';

                for (const item of order.items) {
                    item.itemStatus = 'Expired';
                    const arrayFilter = item.variantId ? { 'v._id': item.variantId } : { 'v.size': item.size, 'v.color': item.color };
                    await Product.updateOne(
                        { _id: item.product },
                        { $inc: { 'variants.$[v].stock': item.quantity } },
                        { arrayFilters: [arrayFilter] }
                    ).catch(err => console.error(`Cron: Failed to restore stock for product ${item.product?._id || item.product}:`, err));
                }

                // Phase 8: Append system audit log
                orderLifecycleService.appendSystemEvent(
                    order,
                    'SYSTEM_EXPIRED_ORDER',
                    prevStatus,
                    'Expired',
                    'Automatic cleanup of abandoned payment session'
                );

                updateLedger(order);
                await order.save().catch(err => console.error(`Cron: Failed to save expired order ${order._id}:`, err));
            }
        } catch (err) {
            console.error('Cron: Order cleanup task failed:', err);
        }
    });
};
