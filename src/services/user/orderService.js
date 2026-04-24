import mongoose from 'mongoose';
import Order from '../../model/orderModel.js';
import Cart from '../../model/cartModel.js';
import Product from '../../model/productModel.js';
import Address from '../../model/addressModel.js';

export const getOrderById = async (userId, orderId) => {
    return Order.findOne({ _id: orderId, user: userId }).populate('items.product');
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

    // 3. Validate Stock & Calculate Totals
    let subtotal = 0;
    const orderItems = [];
    
    for (const item of cart.items) {
        const product = item.product;
        if (!product || !product.isCurrentlyAvailable) {
            return { success: false, message: `Product ${product ? product.name : 'Unknown'} is unavailable.` };
        }

        const variant = product.variants.find(v => v.size === item.size && v.color.name === item.color);
        if (!variant || variant.stock < item.quantity) {
            return { success: false, message: `Not enough stock for ${product.name} (Size: ${item.size}, Color: ${item.color}).` };
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

    // 4. Calculate Final Totals
    const shippingFee = subtotal > 999 ? 0 : 50; // Simple logic: free shipping over 999
    const tax = 0; // Or calculate tax if needed
    const totalAmount = subtotal + shippingFee + tax;

    // 5. Create Order
    const order = new Order({
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

    // 6. Deduct Stock
    for (const item of orderItems) {
        await Product.updateOne(
            { _id: item.product, 'variants.size': item.size, 'variants.color.name': item.color },
            { $inc: { 'variants.$.stock': -item.quantity } }
        );
    }

    // 7. Save Order and Clear Cart
    await order.save();
    
    cart.items = [];
    cart.cartTotal = 0;
    await cart.save();

    return { success: true, orderId: order._id };
};

export const getOrders = async (userId, page = 1, limit = 10, filter = 'All') => {
    const skip = (page - 1) * limit;
    const query = { user: userId };
    if (filter && filter !== 'All') {
        query.orderStatus = filter;
    }

    const [orders, totalOrders] = await Promise.all([
        Order.find(query)
            .populate('items.product')
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
            // Increment stock
            await Product.updateOne(
                { _id: item.product, 'variants.size': item.size, 'variants.color.name': item.color },
                { $inc: { 'variants.$.stock': item.quantity } }
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

    // Increment stock
    await Product.updateOne(
        { _id: item.product, 'variants.size': item.size, 'variants.color.name': item.color },
        { $inc: { 'variants.$.stock': item.quantity } }
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
