import express from 'express';
import { protectRoute } from '../../middleware/user/isAuth.js';
import {
    initiateCheckout,
    verifyPayment,
    handlePaymentFailure,
    retryPayment,
    renderPaymentFailurePage
} from '../../controller/user/paymentController.js';

const router = express.Router();

router.use(protectRoute);

router.post('/initiate', initiateCheckout);
router.post('/verify', verifyPayment);
router.post('/failure', handlePaymentFailure);
router.post('/retry', retryPayment);
router.get('/failure/:orderId', renderPaymentFailurePage);

export default router;
