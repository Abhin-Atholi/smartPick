import mongoose from 'mongoose';
import Order from '../../model/orderModel.js';
import Cart from '../../model/cartModel.js';
import Product from '../../model/productModel.js';
import Address from '../../model/addressModel.js';
import Wallet from '../../model/walletModel.js';
import Coupon from '../../model/couponModel.js';
import * as walletService from './walletService.js';

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
    return Order.findOne({ _id: orderId, user: userId })
        .populate({ path: 'items.product', populate: { path: 'category' } });
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

    // 3. Pre-flight stock check
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
        const itemTotal = variant.price * item.quantity;
        subtotal += itemTotal;
        orderItems.push({
            product: product._id,
            quantity: item.quantity,
            size: item.size,
            color: item.color,
            price: variant.price,
            totalPrice: itemTotal
        });
    }

    if (affectedItems.length > 0) {
        return { success: false, message: 'Some items in your cart are no longer available', affectedItems };
    }

    // 4. Calculate Totals
    const shippingFee = subtotal > 999 ? 0 : 50;
    const tax = 0;
    const couponDiscount = couponData?.discountAmount || 0;
    const totalAmount = Math.max(1, subtotal - couponDiscount + shippingFee + tax);

    // 5. Wallet payment handling
    let walletAmountUsed = 0;
    let finalPaymentStatus = 'Pending';
    let finalOrderStatus = 'Processing';

    if (paymentMethod === 'Wallet') {
        const wallet = await walletService.getOrCreateWallet(userId);
        if (wallet.balance < totalAmount) {
            return { success: false, message: `Insufficient wallet balance. Available: ₹${wallet.balance.toFixed(2)}, Required: ₹${totalAmount.toFixed(2)}` };
        }
        walletAmountUsed = totalAmount;
        finalPaymentStatus = 'Paid';
    }

    // 6. Build order
    const orderId = new mongoose.Types.ObjectId();
    const order = new Order({
        _id: orderId,
        orderId: `SP-${orderId.toString().slice(-6).toUpperCase()}`,
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

    // 7. Deduct stock
    for (const item of orderItems) {
        await Product.updateOne(
            { _id: item.product },
            { $inc: { 'variants.$[v].stock': -item.quantity } },
            { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
        );
    }

    // 8. Debit wallet atomically (after stock deducted, before order save)
    if (paymentMethod === 'Wallet' && walletAmountUsed > 0) {
        await walletService.debitWallet(
            userId,
            walletAmountUsed,
            `Order ${order.orderId} — Wallet Payment`,
            'Order Payment',
            order._id
        );
    }

    // 9. Save order and clear cart
    await order.save();
    cart.items = [];
    cart.cartTotal = 0;
    await cart.save();

    // 10. Mark coupon as used (non-fatal)
    if (couponData?.code && finalPaymentStatus === 'Paid') {
        Coupon.findOneAndUpdate(
            { code: couponData.code },
            { $inc: { usedCount: 1 }, $addToSet: { usedBy: userId } }
        ).catch(err => console.error('Coupon usedBy update failed:', err));
    }

    return { success: true, orderId: order._id };
};

export const getOrders = async (userId, page = 1, limit = 5, filter = 'All', search = {}) => {
    const skip = (page - 1) * limit;
    const query = { user: userId, orderStatus: { $ne: 'Expired' } };

    // Status filter
    if (filter && filter !== 'All') {
        if (filter === 'Processing') {
            query.orderStatus = { $in: ['Processing', 'Shipped', 'Out for Delivery'] };
        } else {
            query.orderStatus = filter;
        }
    }

    // ── Search filters ──────────────────────────────────────────────────────
    const { q, date } = search;

    if (q && q.trim()) {
        const term = q.trim();
        // Try matching orderId first
        const orderIdCondition   = { orderId: { $regex: term, $options: 'i' } };
        // Also search item names by looking up products
        const matchingProducts   = await Product.find(
            { name: { $regex: term, $options: 'i' } },
            '_id'
        ).lean();
        const productIds = matchingProducts.map(p => p._id);
        const itemNameCondition  = productIds.length > 0
            ? { 'items.product': { $in: productIds } }
            : null;

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
    // ────────────────────────────────────────────────────────────────────────

    const [orders, totalOrders, statsArray] = await Promise.all([
        Order.find(query)
            .populate({ path: 'items.product', populate: { path: 'category' } })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Order.countDocuments(query),
        Order.aggregate([
            { $match: { user: new mongoose.Types.ObjectId(userId) } },
            {
                $group: {
                    _id: '$orderStatus',
                    count: { $sum: 1 }
                }
            }
        ])
    ]);

    const stats = {
        Processing: 0,
        Shipped: 0,
        'Out for Delivery': 0,
        Cancelled: 0,
        'Return Requested': 0,
        Returned: 0,
        Delivered: 0,
        totalAll: 0
    };

    statsArray.forEach(s => {
        if (stats.hasOwnProperty(s._id)) {
            stats[s._id] = s.count;
        }
        stats.totalAll += s.count;
    });

    return {
        orders,
        totalOrders,
        totalPages: Math.ceil(totalOrders / limit),
        currentPage: page,
        stats
    };
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
            // Increment stock using arrayFilters
            await Product.updateOne(
                { _id: item.product },
                { $inc: { 'variants.$[v].stock': item.quantity } },
                { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
            );
        }
    }
    
    
    if (order.paymentMethod !== 'COD' && order.paymentStatus === 'Paid') {
        order.paymentStatus = 'Refunded'; 
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

    // Increment stock using arrayFilters
    await Product.updateOne(
        { _id: item.product },
        { $inc: { 'variants.$[v].stock': item.quantity } },
        { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
    );

    // Check if all items are cancelled
    const activeItems = order.items.filter(i => i.itemStatus !== 'Cancelled' && i.itemStatus !== 'Returned');
    if (activeItems.length === 0) {
        order.orderStatus = 'Cancelled';
    }

    if (order.paymentMethod !== 'COD' && order.paymentStatus === 'Paid') {
        // Refund the specific item amount
        await processRefund(userId, item.totalPrice, `Refund for cancelled item in Order ${order.orderId}`, orderId);
        
        // If whole order is now cancelled, mark payment as refunded
        if (order.orderStatus === 'Cancelled') {
            order.paymentStatus = 'Refunded';
        }
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

    // Check if all items are Return Requested / Returned / Cancelled
    const allReturnedOrCancelled = order.items.every(i => ['Return Requested', 'Returned', 'Cancelled'].includes(i.itemStatus));
    if (allReturnedOrCancelled && order.orderStatus !== 'Returned') {
        order.orderStatus = 'Return Requested';
    }

    await order.save();
    return { success: true, message: "Item return requested successfully" };
};
