import express from 'express';
import { protectRoute } from '../../middleware/user/isAuth.js';
import {
    initiateCheckout,
    verifyPayment,
    handlePaymentFailure,
    retryPayment,
    renderPaymentFailurePage,
    completePendingOrder,
    handleRazorpayWebhook
} from '../../controllers/user/payment.controller.js';

const router = express.Router();

// Webhook doesn't require user session
router.post('/webhook', handleRazorpayWebhook);

router.use(protectRoute);

router.post('/initiate', initiateCheckout);
router.post('/verify', verifyPayment);
router.post('/failure', handlePaymentFailure);
router.post('/retry', retryPayment);
router.post('/complete-pending', completePendingOrder);
router.get('/failure/:orderId', renderPaymentFailurePage);


export default router;

