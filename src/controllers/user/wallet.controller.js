import * as walletService from '../../services/user/wallet.service.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'test_key',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'test_secret'
});

export const getWalletPage = asyncHandler(async (req, res) => {
    const userId = req.currentUser?._id || req.session?.user?._id;
    if (!userId) return res.redirect('/login');

    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    // Extract filter params from query string
    const filters = {
        search:   (req.query.search   || '').trim(),
        type:     req.query.type     || '',
        dateFrom: req.query.dateFrom || '',
        dateTo:   req.query.dateTo   || ''
    };

    const data = await walletService.getTransactionHistory(userId, page, limit, filters);

    res.render('user/wallet/index', {
        title: 'My Wallet — SmartPick',
        activePath: '/wallet',
        balance: data.balance,
        transactions: data.transactions,
        currentPage: data.currentPage,
        totalPages: data.totalPages,
        total: data.total,
        razorpayKey: process.env.RAZORPAY_KEY_ID,
        filters   // pass filters back so the view can pre-fill inputs
    });
});

/**
 * Create a Razorpay order for wallet top-up
 */
export const initiateWalletTopup = async (req, res) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        if (!userId) return res.status(401).json({ success: false, message: 'Please login first.' });

        const amount = parseFloat(req.body.amount);
        if (!amount || amount < 1 || amount > 50000) {
            return res.status(400).json({ success: false, message: 'Amount must be between ₹1 and ₹50,000.' });
        }

        const rzpOrder = await razorpay.orders.create({
            amount: Math.round(amount * 100), // paise
            currency: 'INR',
            receipt: `wlt_${userId.toString().slice(-8)}_${Date.now().toString().slice(-10)}`
        });

        return res.status(200).json({
            success: true,
            orderId: rzpOrder.id,
            amount,
            key: process.env.RAZORPAY_KEY_ID
        });
    } catch (err) {
        console.error('initiateWalletTopup Error:', err);
        return res.status(500).json({ success: false, message: 'Could not initiate payment.' });
    }
};

/**
 * Verify Razorpay payment and credit the wallet
 */
export const verifyWalletTopup = async (req, res) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        if (!userId) return res.status(401).json({ success: false, message: 'Please login first.' });

        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

        // Verify signature
        const generated = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (generated !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature. Please contact support.' });
        }

        const creditAmount = parseFloat(amount);
        if (!creditAmount || creditAmount < 1) {
            return res.status(400).json({ success: false, message: 'Invalid amount.' });
        }

        await walletService.creditWallet(
            userId,
            creditAmount,
            `Wallet top-up via Razorpay (${razorpay_payment_id})`,
            'Top-up'
        );

        return res.status(200).json({
            success: true,
            message: `₹${creditAmount.toLocaleString('en-IN')} added to your wallet successfully!`
        });
    } catch (err) {
        console.error('verifyWalletTopup Error:', err);
        return res.status(500).json({ success: false, message: 'Verification failed.' });
    }
};

