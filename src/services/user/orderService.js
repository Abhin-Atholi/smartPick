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

const processRefund = async (userId, amount, description, orderId) => {
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
        wallet = new Wallet({ userId, balance: 0, transactions: [] });
    }
    wallet.balance += amount;
    wallet.transactions.push({
        type: 'Credit',
        amount,
        description,
        orderId
    });
    await wallet.save();
};

export const getOrderById = async (userId, orderId) => {
    const order = await Order.findOne({ _id: orderId, user: userId })
        .populate({ path: 'items.product', populate: { path: 'category' } });

    if (!order) return null;

    // Robust Expiry Check: If order is still pending/failed but retry window closed
    const isRzpPending = ['Payment Pending', 'Payment Failed'].includes(order.orderStatus);
    const hasExpiry = order.retryExpiresAt;

    if (isRzpPending && hasExpiry && new Date() > order.retryExpiresAt && !order.stockRestored) {
        order.stockRestored = true;
        order.orderStatus = 'Expired';
        order.paymentStatus = 'Expired';
        for (const item of order.items) {
            item.itemStatus = 'Expired';
            await Product.updateOne(
                { _id: item.product },
                { $inc: { 'variants.$[v].stock': item.quantity } },
                { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
            );
        }
        await order.save();
    }

    return order;
};

export const placeOrder = async (userId, addressId, paymentMethod, couponData = null) => {
    // 1. Fetch Cart
    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || cart.items.length === 0) {
        return { success: false, message: 'Your cart is empty' };
    }

    // 2. Fetch Address
    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
        return { success: false, message: 'Address not found' };
    }

    // 3. Pre-flight stock check & item building
    const affectedItems = [];
    const orderItems = [];
    let subtotal = 0;

    for (const item of cart.items) {
        const product = item.product;
        if (!product || product.isDeleted || !product.isActive) {
            affectedItems.push({ name: product?.name || 'Unknown', reason: 'Product is unavailable' });
            continue;
        }
        const variant = product.variants.find(v => v.size === item.size && v.color.name === item.color);
        if (!variant) {
            affectedItems.push({ name: product.name, reason: `Variant (Size: ${item.size}, Color: ${item.color}) not found` });
            continue;
        }
        if (variant.stock < item.quantity) {
            affectedItems.push({ name: product.name, reason: `Only ${variant.stock} unit(s) left (you need ${item.quantity})` });
            continue;
        }

        // Recalculate Offer
        const categoryId = product.category?._id || product.category;
        const bestOffer = await offerHelper.getBestOffer(product._id, categoryId, variant.price);

        const originalPrice = variant.price;
        const finalPrice = bestOffer ? bestOffer.finalPrice : originalPrice;
        const discountPerUnit = originalPrice - finalPrice;
        const itemTotal = finalPrice * item.quantity;

        subtotal += itemTotal;
        orderItems.push({
            product: product._id,
            quantity: item.quantity,
            size: item.size,
            color: item.color,
            price: finalPrice,
            originalPrice: originalPrice,
            discountAmount: discountPerUnit,
            totalPrice: itemTotal,
            offerApplied: bestOffer ? {
                offerId: bestOffer.offerId,
                offerName: bestOffer.offerName,
                offerType: bestOffer.offerType,
                discountType: bestOffer.discountType,
                discountAmount: bestOffer.discountAmount * item.quantity
            } : undefined,
            itemStatus: (paymentMethod === 'Razorpay') ? 'Payment Pending' : 'Processing'
        });
    }

    if (affectedItems.length > 0) {
        return { success: false, message: 'Some items in your cart are no longer available', affectedItems };
    }

    // 4. Calculate Totals (Tax is applied AFTER discounts)
    const shippingFee = subtotal > 499 ? 0 : 50;
    const couponDiscount = couponData?.discountAmount || 0;
    const taxableAmount = taxHelper.calculateTaxableAmount(subtotal, couponDiscount);
    const tax = taxHelper.calculateTax(taxableAmount);
    const totalAmount = Math.max(1, subtotal - couponDiscount + shippingFee + tax);

    let originalSubtotal = 0;
    orderItems.forEach(item => { originalSubtotal += (item.originalPrice * item.quantity); });
    const totalOfferDiscount = originalSubtotal - subtotal;

    // 5. Initial Statuses
    let walletAmountUsed = 0;
    let finalPaymentStatus = 'Pending';
    let finalOrderStatus = (paymentMethod === 'Razorpay') ? 'Payment Pending' : 'Processing';

    // Handle Wallet logic early to check balance
    if (paymentMethod === 'Wallet') {
        const wallet = await walletService.getOrCreateWallet(userId);
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
        items: orderItems,
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
        originalSubtotal,
        totalOfferDiscount,
        subtotal,
        shippingFee,
        tax,
        discount: couponDiscount,
        walletAmountUsed,
        totalAmount,
        paymentMethod,
        paymentStatus: finalPaymentStatus,
        orderStatus: finalOrderStatus,
        couponApplied: couponData ? {
            code: couponData.code,
            discountAmount: couponData.discountAmount,
            discountType: couponData.discountType
        } : undefined
    });

    if (paymentMethod === 'Razorpay') {
        order.retryExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
        order.paymentDetails = {
            retryExpiryTime: new Date(Date.now() + 5 * 60 * 1000),
            failedAttempts: 0
        };
    }

    // 7. STOCK RESERVATION
    for (const item of orderItems) {
        await Product.updateOne(
            { _id: item.product },
            { $inc: { 'variants.$[v].stock': -item.quantity } },
            { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
        );
    }

    // 8. Wallet debit (Atomic)
    if (paymentMethod === 'Wallet' && walletAmountUsed > 0) {
        await walletService.debitWallet(
            userId,
            walletAmountUsed,
            `Order ${order.orderId} — Wallet Payment`,
            'Order Payment',
            order._id
        );
    }

    // 9. Finalize Order and Clear Cart
    await order.save();
    cart.items = [];
    cart.cartTotal = 0;
    await cart.save();

    // 10. Mark coupon used (Only for immediate payment methods)
    if (couponData?.code && (paymentMethod === 'Wallet' || paymentMethod === 'COD')) {
        await Coupon.updateOne(
            { code: couponData.code },
            { $inc: { usedCount: 1 }, $addToSet: { usedBy: userId } }
        );
    }

    return { success: true, orderId: order._id, totalAmount: order.totalAmount };
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
            order.stockRestored = true;
            order.orderStatus = 'Expired';
            order.paymentStatus = 'Expired';
            for (const item of order.items) {
                item.itemStatus = 'Expired';
                await Product.updateOne(
                    { _id: item.product },
                    { $inc: { 'variants.$[v].stock': item.quantity } },
                    { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
                );
            }
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
    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return { success: false, message: "Order not found" };

    if (order.orderStatus !== 'Processing') {
        return { success: false, message: `Cannot cancel an order that is already ${order.orderStatus.toLowerCase()}` };
    }

    order.orderStatus = 'Cancelled';
    order.cancelReason = reason;

    for (const item of order.items) {
        if (item.itemStatus !== 'Cancelled' && item.itemStatus !== 'Returned') {
            item.itemStatus = 'Cancelled';
            item.cancelReason = reason;
            await Product.updateOne(
                { _id: item.product },
                { $inc: { 'variants.$[v].stock': item.quantity } },
                { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
            );
        }
    }

    if (order.paymentStatus === 'Paid') {
        order.paymentStatus = 'Refunded';
        // Full order totalAmount already includes tax — refund the whole thing
        await processRefund(userId, order.totalAmount, `Refund for cancelled Order ${order.orderId}`, orderId);
    }

    await order.save();
    return { success: true, message: "Order cancelled successfully" };
};

export const returnOrder = async (userId, orderId, reason) => {
    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return { success: false, message: "Order not found" };

    if (order.orderStatus !== 'Delivered') {
        return { success: false, message: "Only delivered orders can be returned" };
    }

    let updatedCount = 0;
    for (const item of order.items) {
        if (item.itemStatus === 'Delivered') {
            item.itemStatus = 'Return Requested';
            item.returnReason = reason;
            updatedCount++;
        }
    }

    if (updatedCount === 0) {
        return { success: false, message: "No eligible delivered items to return" };
    }

    order.orderStatus = 'Return Requested';
    order.returnReason = reason;

    await order.save();
    return { success: true, message: "Return requested successfully" };
};

export const cancelOrderItem = async (userId, orderId, itemId, reason) => {
    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return { success: false, message: "Order not found" };

    const item = order.items.id(itemId);
    if (!item) return { success: false, message: "Item not found in order" };

    if (item.itemStatus !== 'Processing') {
        return { success: false, message: `Cannot cancel an item that is already ${item.itemStatus.toLowerCase()}` };
    }

    item.itemStatus = 'Cancelled';
    item.cancelReason = reason;

    await Product.updateOne(
        { _id: item.product },
        { $inc: { 'variants.$[v].stock': item.quantity } },
        { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
    );

    const activeItems = order.items.filter(i => i.itemStatus !== 'Cancelled' && i.itemStatus !== 'Returned');
    if (activeItems.length === 0) order.orderStatus = 'Cancelled';

    if (order.paymentStatus === 'Paid') {
        // Proportional tax refund: refund item amount + its share of the total tax
        const taxableAmount = taxHelper.calculateTaxableAmount(order.subtotal, order.discount || 0);
        const itemTaxRefund = taxHelper.calculateRefundTax(item.totalPrice, order.tax || 0, taxableAmount);
        const refundAmount = item.totalPrice + itemTaxRefund;
        await processRefund(userId, refundAmount, `Refund for cancelled item in Order ${order.orderId}`, orderId);

        if (order.orderStatus === 'Cancelled') order.paymentStatus = 'Refunded';
    }

    await order.save();
    return { success: true, message: "Item cancelled successfully" };
};

export const returnOrderItem = async (userId, orderId, itemId, reason) => {
    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return { success: false, message: "Order not found" };

    const item = order.items.id(itemId);
    if (!item) return { success: false, message: "Item not found in order" };

    if (item.itemStatus !== 'Delivered') {
        return { success: false, message: "Only delivered items can be returned" };
    }

    item.itemStatus = 'Return Requested';
    item.returnReason = reason;

    const allReturnedOrCancelled = order.items.every(i => ['Return Requested', 'Returned', 'Cancelled'].includes(i.itemStatus));
    if (allReturnedOrCancelled && order.orderStatus !== 'Returned') {
        order.orderStatus = 'Return Requested';
    }

    await order.save();
    return { success: true, message: "Item return requested successfully" };
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
    console.log('📦 Cron: Order cleanup task initialized (Every 30s)');

    cron.schedule('*/30 * * * * *', async () => {
        try {
            const now = new Date();
            const expiredOrders = await Order.find({
                orderStatus: { $in: ['Payment Pending', 'Payment Failed'] },
                paymentStatus: { $ne: 'Paid' },
                stockRestored: false,
                retryExpiresAt: { $lt: now }
            }).populate('items.product');

            if (expiredOrders.length === 0) return;

            console.log(`🧹 Cron: Auto-restoring stock for ${expiredOrders.length} expired order(s)...`);

            for (const order of expiredOrders) {
                order.stockRestored = true;
                order.orderStatus = 'Expired';
                order.paymentStatus = 'Expired';

                for (const item of order.items) {
                    item.itemStatus = 'Expired';
                    await Product.updateOne(
                        { _id: item.product },
                        { $inc: { 'variants.$[v].stock': item.quantity } },
                        { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
                    ).catch(err => console.error(`Cron Failed to restore stock for ${item.product}:`, err));
                }
                await order.save().catch(err => console.error(`Cron Failed to save expired order ${order._id}:`, err));
            }
        } catch (err) {
            console.error('Order cleanup task failed:', err);
        }
    }, 60 * 1000);
};
