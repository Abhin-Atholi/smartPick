import Razorpay from 'razorpay';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Order from '../../model/orderModel.js';
import Cart from '../../model/cartModel.js';
import Product from '../../model/productModel.js';
import Address from '../../model/addressModel.js';
import * as couponHelper from '../../utils/couponHelper.js';
import * as offerHelper from '../../utils/offerHelper.js';
import Coupon from '../../model/couponModel.js';
import * as walletService from '../../services/user/wallet.service.js';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'test_key',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'test_secret'
});

import * as orderService from '../../services/user/order.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const initiateCheckout = asyncHandler(async (req, res) => {
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

    // Clear coupon from session now — it is permanently stored in order.couponApplied
    // and baked into the frozen order.totalAmount. Keeping it in session would allow
    // the same coupon to be applied again on a subsequent order if this payment fails.
    if (req.session.appliedCoupon) {
        delete req.session.appliedCoupon;
    }

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
});

export const verifyPayment = asyncHandler(async (req, res) => {
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
        try {
            await Coupon.updateOne(
                { code: order.couponApplied.code },
                { $inc: { usedCount: 1 }, $addToSet: { usedBy: userId } }
            );
        } catch (err) {
            console.error('Coupon final usage update failed:', err);
        }
    }

    return res.status(200).json({ success: true, redirectUrl: `/orders/success?orderId=${order._id}` });
});

export const handlePaymentFailure = asyncHandler(async (req, res) => {
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
});

export const retryPayment = asyncHandler(async (req, res) => {
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
        amount: Math.round(order.totalAmount * 100),
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
});

export const renderPaymentFailurePage = asyncHandler(async (req, res) => {
    const userId = req.currentUser?._id || req.session?.user?._id;
    const { orderId } = req.params;

    const order = await orderService.getOrderById(userId, orderId);
    if (!order) return res.redirect('/orders');

    // Fetch wallet balance so the failure page can show it next to the Wallet option
    const walletData = await walletService.getOrCreateWallet(userId);
    const walletBalance = walletData?.balance || 0;

    res.render('user/payments/payment-failure', {
        title: 'Payment Failed',
        order,
        walletBalance
    });
});

export const completePendingOrder = asyncHandler(async (req, res) => {
    const userId = req.currentUser?._id || req.session?.user?._id;
    const { orderId, paymentMethod } = req.body;

    if (!orderId || !paymentMethod) {
        return res.status(400).json({ success: false, message: 'orderId and paymentMethod are required.' });
    }
    if (!['COD', 'Wallet'].includes(paymentMethod)) {
        return res.status(400).json({ success: false, message: 'Invalid payment method. Choose COD or Wallet.' });
    }

    const result = await orderService.completeFailedOrder(userId, orderId, paymentMethod);

    if (!result.success) {
        // Return a 402 for insufficient balance so the frontend can detect it specifically
        const status = result.insufficientBalance ? 402 : 400;
        return res.status(status).json(result);
    }

    return res.status(200).json({ success: true, redirectUrl: `/orders/success?orderId=${result.orderId}` });
});

export const handleRazorpayWebhook = asyncHandler(async (req, res) => {
    // Razorpay webhook signature verification
    const secret = process.env.RAZORPAY_KEY_SECRET; // Or a dedicated webhook secret if configured in Razorpay dashboard
    const signature = req.headers['x-razorpay-signature'];

    if (!signature) {
        return res.status(400).send("No signature provided");
    }

    // Verify signature
    const shasum = crypto.createHmac('sha256', secret);
    // Important: we need the raw string body. Assuming we are using express.raw or express.json stringified.
    // If body-parser already parsed it to an object, we must stringify it.
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');

    if (digest !== signature) {
        return res.status(400).send("Invalid signature");
    }

    const event = req.body.event;
    const paymentEntity = req.body.payload.payment.entity;

    if (event === 'payment.captured' || event === 'order.paid') {
        const orderId = paymentEntity.notes?.orderId || paymentEntity.order_id;
        
        if (orderId) {
            // Find order by internal orderId or by Razorpay orderId
            const order = await Order.findOne({ 
                $or: [{ orderId: orderId }, { 'paymentDetails.razorpayOrderId': orderId }] 
            });

            if (order && order.paymentStatus === 'Pending') {
                await orderService.completeFailedOrder(order.userId, order.orderId, 'Razorpay');
            }
        }
    }

    res.status(200).json({ status: 'ok' });
});
