import Razorpay from 'razorpay';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Order from '../../model/orderModel.js';
import Cart from '../../model/cartModel.js';
import Product from '../../model/productModel.js';
import Address from '../../model/addressModel.js';
import * as couponHelper from '../../utils/couponHelper.js';
import { processReferralReward } from '../../utils/referralHelper.js';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'test_key',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'test_secret'
});

export const initiateCheckout = async (req, res) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { addressId } = req.body;

        // 1. Fetch Cart
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Your cart is empty' });
        }

        // 2. Fetch Address
        const address = await Address.findOne({ _id: addressId, userId });
        if (!address) {
            return res.status(400).json({ success: false, message: 'Address not found' });
        }

        // 3. Pre-flight stock check
        const orderItems = [];
        let subtotal = 0;

        for (const item of cart.items) {
            const product = item.product;
            if (!product || product.isDeleted || !product.isActive) {
                return res.status(400).json({ success: false, message: 'Some products are unavailable' });
            }
            const variant = product.variants.find(v => v.size === item.size && v.color.name === item.color);
            if (!variant || variant.stock < item.quantity) {
                return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
            }
            const itemTotal = variant.price * item.quantity;
            subtotal += itemTotal;
            orderItems.push({ product: product._id, quantity: item.quantity, size: item.size, color: item.color, price: variant.price, totalPrice: itemTotal, itemStatus: 'Payment Pending' });
        }

        // 4. Calculate Final Totals
        const shippingFee = subtotal > 999 ? 0 : 50;
        const tax = 0;
        
        let discount = 0;
        let couponAppliedData = null;

        if (req.session.appliedCoupon) {
            try {
                const result = await couponHelper.validateAndCalculateDiscount(
                    req.session.appliedCoupon.code,
                    subtotal,
                    userId
                );
                discount = result.discountAmount;
                couponAppliedData = {
                    code: result.coupon.code,
                    discountAmount: discount,
                    discountType: result.coupon.discountType
                };
            } catch (error) {
                delete req.session.appliedCoupon;
                req.session.save();
                return res.status(400).json({ success: false, message: `Coupon Error: ${error.message}` });
            }
        }

        const totalAmount = subtotal - discount + shippingFee + tax;

        // 5. Initialize Razorpay Order
        const rzpOrder = await razorpay.orders.create({
            amount: totalAmount * 100, // paise
            currency: 'INR',
            receipt: `receipt_${Date.now()}`
        });

        // 6. Create local Order document
        const orderIdObj = new mongoose.Types.ObjectId();
        const retryExpiryTime = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

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
            subtotal,
            shippingFee,
            tax,
            discount,
            totalAmount,
            paymentMethod: 'Razorpay',
            paymentStatus: 'Pending',
            orderStatus: 'Payment Pending',
            couponApplied: couponAppliedData,
            paymentDetails: {
                razorpayOrderId: rzpOrder.id,
                retryExpiryTime,
                failedAttempts: 0
            }
        });

        // 7. Atomic inventory decrement (locking stock during payment window)
        for (const item of orderItems) {
            await Product.updateOne(
                { _id: item.product },
                { $inc: { 'variants.$[v].stock': -item.quantity } },
                { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
            );
        }

        await order.save();

        // 8. Robust background task to auto-release stock if unpaid after 5 mins
        setTimeout(async () => {
            try {
                const currentOrder = await Order.findById(orderIdObj);
                if (currentOrder && currentOrder.paymentStatus !== 'Paid' && currentOrder.orderStatus !== 'Expired') {
                    currentOrder.orderStatus = 'Expired';
                    currentOrder.paymentStatus = 'Expired';
                    for (const item of currentOrder.items) {
                        item.itemStatus = 'Expired';
                        // Release held stock back to inventory
                        await Product.updateOne(
                            { _id: item.product },
                            { $inc: { 'variants.$[v].stock': item.quantity } },
                            { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
                        );
                    }
                    await currentOrder.save();
                }
            } catch (err) {
                console.error("Auto-expire stock release error:", err);
            }
        }, 5 * 60 * 1000 + 2000); // 5 mins + 2 seconds buffer

        return res.status(200).json({
            success: true,
            orderId: order._id,
            razorpayOrderId: rzpOrder.id,
            amount: totalAmount,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error("initiateCheckout Error:", error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

export const verifyPayment = async (req, res) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

        const order = await Order.findOne({ _id: orderId, user: userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        if (order.paymentStatus === 'Paid') {
            return res.status(400).json({ success: false, message: 'Payment already verified' });
        }

        // Expiry check
        if (new Date() > order.paymentDetails.retryExpiryTime) {
            for (const item of order.items) {
                item.itemStatus = 'Expired';
                // Stock is already released by the background setTimeout, or we do it here if background task failed/delayed
                // Actually to be safe and idempotent, we should check if it was already expired, but our check `order.orderStatus !== 'Expired'` handles that if we just let the setTimeout do it. 
                // But if they manually hit verify right at expiry before setTimeout, we should restore it.
            }
            if (order.orderStatus !== 'Expired') {
                for (const item of order.items) {
                    await Product.updateOne(
                        { _id: item.product },
                        { $inc: { 'variants.$[v].stock': item.quantity } },
                        { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
                    );
                }
                order.orderStatus = 'Expired';
                order.paymentStatus = 'Expired';
                await order.save();
            }
            return res.status(400).json({ success: false, message: 'Payment session expired' });
        }

        // Signature Verification
        const generatedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + "|" + razorpay_payment_id)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        // Payment is verified
        order.paymentStatus = 'Paid';
        order.orderStatus = 'Processing';
        order.paymentDetails.razorpayPaymentId = razorpay_payment_id;
        order.paymentDetails.razorpaySignature = razorpay_signature;

        for (const item of order.items) {
            item.itemStatus = 'Processing';
            // Stock was ALREADY deducted during initiateCheckout! No need to deduct here.
        }

        await order.save();

        // Cleanup Cart
        await Cart.deleteOne({ user: userId });

        // Trigger referral reward non-fatally
        processReferralReward(userId).catch(err => 
            console.error('Referral reward trigger failed (non-fatal):', err)
        );

        return res.status(200).json({ success: true, redirectUrl: `/order/success?orderId=${order._id}` });

    } catch (error) {
        console.error("verifyPayment Error:", error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

export const handlePaymentFailure = async (req, res) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { orderId } = req.body;

        const order = await Order.findOne({ _id: orderId, user: userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        order.orderStatus = 'Payment Failed';
        order.paymentStatus = 'Failed';
        order.paymentDetails.failedAttempts += 1;

        for (const item of order.items) {
            item.itemStatus = 'Payment Failed';
        }

        await order.save();

        return res.status(200).json({ success: true, message: 'Payment failure registered', redirectUrl: `/payment/failure/${order._id}` });

    } catch (error) {
        console.error("handlePaymentFailure Error:", error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

export const retryPayment = async (req, res) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { orderId } = req.body;

        const order = await Order.findOne({ _id: orderId, user: userId }).populate('items.product');
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        if (new Date() > order.paymentDetails.retryExpiryTime) {
            for (const item of order.items) {
                item.itemStatus = 'Expired';
            }
            if (order.orderStatus !== 'Expired') {
                for (const item of order.items) {
                    await Product.updateOne(
                        { _id: item.product },
                        { $inc: { 'variants.$[v].stock': item.quantity } },
                        { arrayFilters: [{ 'v.size': item.size, 'v.color.name': item.color }] }
                    );
                }
                order.orderStatus = 'Expired';
                order.paymentStatus = 'Expired';
                await order.save();
            }
            return res.status(400).json({ success: false, message: 'Payment session expired' });
        }

        // Pre-Flight Stock Verification removed!
        // We already locked/deducted the stock during initiateCheckout, so we don't need to check again.

        // Generate New Gateway ID
        const rzpOrder = await razorpay.orders.create({
            amount: order.totalAmount * 100,
            currency: 'INR',
            receipt: `retry_${Date.now()}`
        });

        order.paymentDetails.razorpayOrderId = rzpOrder.id;
        await order.save();

        return res.status(200).json({
            success: true,
            razorpayOrderId: rzpOrder.id,
            amount: order.totalAmount,
            key: process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {
        console.error("retryPayment Error:", error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

export const renderPaymentFailurePage = async (req, res) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { orderId } = req.params;

        const order = await Order.findOne({ _id: orderId, user: userId });
        if (!order) return res.redirect('/orders');

        res.render('user/payments/payment-failure', {
            title: 'Payment Failed',
            order
        });
    } catch (error) {
        console.error("renderPaymentFailurePage Error:", error);
        res.redirect('/orders');
    }
};
