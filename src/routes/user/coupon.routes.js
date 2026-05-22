import express from 'express';
const router = express.Router();
import * as couponController from '../../controllers/user/coupon.controller.js';
import { protectRoute } from '../../middleware/user/isAuth.js';

router.get('/available-coupons', couponController.getAvailableCoupons); // Public — no auth needed
router.post('/apply-coupon', protectRoute, couponController.applyCoupon);
router.post('/remove-coupon', protectRoute, couponController.removeCoupon);

export default router;

