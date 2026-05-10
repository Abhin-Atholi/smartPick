import Razorpay from 'razorpay';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Order from '../../model/orderModel.js';
import Cart from '../../model/cartModel.js';
import Product from '../../model/productModel.js';
import Address from '../../model/addressModel.js';
import * as couponHelper from '../../utils/couponHelper.js';
import * as offerHelper from '../../utils/offerHelper.js';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'test_key',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'test_secret'
});

import * as orderService from '../../services/user/orderService.js';

export const initiateCheckout = async (req, res) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { addressId } = req.body;

        if (!addressId) {
            return res.status(400).json({ success: false, message: 'Please select a shipping address' });
        }

        // 1. Centralized Order Placement (Handles stock, coupons, offers, and initial Pending status)
        const couponData = req.session.appliedCoupon || null;
        const result = await orderService.placeOrder(userId, addressId, 'Razorpay', couponData);

        if (!result.success) {
            return res.status(400).json({ 
                success: false, 
                message: result.message, 
                affectedItems: result.affectedItems || [] 
            });
        }

        const { orderId, totalAmount } = result;

        // 2. Initialize Razorpay Gateway Order
        const rzpOrder = await razorpay.orders.create({
            amount: Math.round(totalAmount * 100), // paise
            currency: 'INR',
            receipt: `order_rcpt_${orderId.toString().slice(-6)}`
        });

        // 3. Update Order with Gateway ID
        await Order.findByIdAndUpdate(orderId, {
            'paymentDetails.razorpayOrderId': rzpOrder.id
        });

        // Note: Stock restoration is now handled automatically by node-cron and getOrderById fail-safes using the stockRestored flag.
        return res.status(200).json({
            success: true,
            orderId,
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

    const order = await orderService.getOrderById(userId, orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.orderStatus === 'Expired') {
        return res.status(400).json({ success: false, message: 'Order session has expired and stock has been released.' });
    }

    if (order.paymentStatus === 'Paid') {
        return res.status(400).json({ success: false, message: 'Payment already verified' });
    }

        // Expiry check - getOrderById handles the actual DB update and stock release,
        // but we double-check the status here just in case.
        if (order.orderStatus === 'Expired') {
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

        // Finalize Coupon Usage
        if (order.couponApplied?.code) {
            await Coupon.updateOne(
                { code: order.couponApplied.code },
                { $inc: { usedCount: 1 }, $addToSet: { usedBy: userId } }
            ).catch(err => console.error('Coupon final usage update failed:', err));
        }

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

        const order = await orderService.getOrderById(userId, orderId);
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

        const order = await orderService.getOrderById(userId, orderId);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        if (order.orderStatus === 'Expired') {
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

        const order = await orderService.getOrderById(userId, orderId);
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
