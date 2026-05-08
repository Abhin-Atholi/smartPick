import express from 'express';
const router = express.Router();
import * as couponController from '../../controller/admin/couponController.js';

router.get('/', couponController.getCoupons);
router.post('/add', couponController.addCoupon);
router.patch('/edit/:id', couponController.editCoupon);
router.patch('/toggle/:id', couponController.toggleCoupon);
router.delete('/delete/:id', couponController.deleteCoupon);

export default router;
