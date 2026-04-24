import mongoose from 'mongoose';
import Order from '../../model/orderModel.js';
import Cart from '../../model/cartModel.js';
import Product from '../../model/productModel.js';
import Address from '../../model/addressModel.js';

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
