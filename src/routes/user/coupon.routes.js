import express from 'express';
const router = express.Router();
import * as couponController from '../../controllers/user/coupon.controller.js';
import { protectRoute } from '../../middleware/user/isAuth.js';

// Mounted at /coupons
router.get('/available', couponController.getAvailableCoupons); // Public — no auth needed
router.post('/apply', protectRoute, couponController.applyCoupon);
router.post('/remove', protectRoute, couponController.removeCoupon);

export default router;

