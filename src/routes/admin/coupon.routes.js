import express from 'express';
const router = express.Router();

import * as couponController from '../../controllers/admin/coupon.controller.js';
import { validateRequest } from '../../middleware/validationMiddleware.js';
import { createCouponSchema, updateCouponSchema } from '../../validators/admin/couponValidator.js';

router.get('/', couponController.getCoupons);
router.post('/add', validateRequest(createCouponSchema), couponController.addCoupon);
router.patch('/edit/:id', validateRequest(updateCouponSchema), couponController.editCoupon);
router.patch('/toggle/:id', couponController.toggleCoupon);
router.delete('/delete/:id', couponController.deleteCoupon);

export default router;

