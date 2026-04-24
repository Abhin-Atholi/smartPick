import mongoose from 'mongoose';
import Order from '../../model/orderModel.js';
import Cart from '../../model/cartModel.js';
import Product from '../../model/productModel.js';
import Address from '../../model/addressModel.js';

export const getOrderById = async (userId, orderId) => {
    return Order.findOne({ _id: orderId, user: userId })
        .populate({ path: 'items.product', populate: { path: 'category' } });
};

export const placeOrder = async (userId, addressId, paymentMethod) => {
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

    // 3. Pre-flight stock check — validate ALL items first, collect failures
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
        orderItems.push({ product: product._id, quantity: item.quantity, size: item.size, color: item.color, price: variant.price, totalPrice: itemTotal });
    }

    if (affectedItems.length > 0) {
        return { success: false, message: 'Some items in your cart are no longer available', affectedItems };
    }

    // 4. Calculate Final Totals
    const shippingFee = subtotal > 999 ? 0 : 50; // Simple logic: free shipping over 999
    const tax = 0; // Or calculate tax if needed
    const totalAmount = subtotal + shippingFee + tax;

    // 5. Create Order — pre-generate _id so orderId is always derived uniquely
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
        discount: 0,
        totalAmount,
        paymentMethod,
        paymentStatus: 'Pending',
        orderStatus: 'Processing'
    });

    // 6. Deduct Stock using arrayFilters to safely target the exact variant
    for (const item of orderItems) {
        await Product.updateOne(
            { _id: item.product },
            { $inc: { 'variants.$[v].stock': -item.quantity } },
            { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
        );
    }

    // 7. Save Order and Clear Cart
    await order.save();
    
    cart.items = [];
    cart.cartTotal = 0;
    await cart.save();

    return { success: true, orderId: order._id };
};

export const getOrders = async (userId, page = 1, limit = 5, filter = 'All', search = {}) => {
    const skip = (page - 1) * limit;
    const query = { user: userId };

    // Status filter
    if (filter && filter !== 'All') {
        query.orderStatus = filter;
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

    const [orders, totalOrders] = await Promise.all([
        Order.find(query)
            .populate({ path: 'items.product', populate: { path: 'category' } })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit),
        Order.countDocuments(query)
    ]);

    return {
        orders,
        totalOrders,
        totalPages: Math.ceil(totalOrders / limit),
        currentPage: page
    };
};

export const cancelOrder = async (userId, orderId, reason) => {
    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return { success: false, message: "Order not found" };

    if (['Shipped', 'Delivered', 'Cancelled', 'Returned'].includes(order.orderStatus)) {
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
        order.paymentStatus = 'Refunded'; // Or handle wallet refund later
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

    order.orderStatus = 'Return Requested';
    order.returnReason = reason;

    for (const item of order.items) {
        if (item.itemStatus === 'Delivered') {
            item.itemStatus = 'Return Requested';
            item.returnReason = reason;
        }
    }

    await order.save();
    return { success: true, message: "Return requested successfully" };
};

export const cancelOrderItem = async (userId, orderId, itemId, reason) => {
    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) return { success: false, message: "Order not found" };

    const item = order.items.id(itemId);
    if (!item) return { success: false, message: "Item not found in order" };

    if (['Shipped', 'Delivered', 'Cancelled', 'Returned'].includes(item.itemStatus)) {
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
        if (order.paymentMethod !== 'COD' && order.paymentStatus === 'Paid') {
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
