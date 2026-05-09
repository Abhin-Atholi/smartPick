import * as couponHelper from '../../utils/couponHelper.js';
import * as cartService from '../../services/user/cartService.js';
import Coupon from '../../model/couponModel.js';

export const applyCoupon = async (req, res) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { couponCode } = req.body;

        if (!userId) {
            return res.status(401).json({ success: false, message: "Please login to apply a coupon." });
        }

        if (req.session.appliedCoupon) {
            return res.status(400).json({ success: false, message: "A coupon is already applied. Remove it first." });
        }

        const cartData = await cartService.getCart(userId, 1, 100);
        if (!cartData || cartData.items.length === 0) {
            return res.status(400).json({ success: false, message: "Your cart is empty." });
        }

        let subtotal = 0;
        cartData.items.forEach(item => {
            if (item.product.isActive && !item.product.isDeleted) {
                const variant = item.product.variants.find(v => v.size === item.size && v.color && v.color.name === item.color);
                const availableStock = variant ? variant.stock : 0;
                const isLowStock = availableStock > 0 && availableStock < item.quantity;
                const isOutOfStock = availableStock === 0;
                if (!isLowStock && !isOutOfStock) {
                    subtotal += item.totalPrice;
                }
            }
        });

        if (subtotal === 0) {
            return res.status(400).json({ success: false, message: "No valid items in cart to apply coupon." });
        }

        const result = await couponHelper.validateAndCalculateDiscount(couponCode, subtotal, userId);

        req.session.appliedCoupon = {
            code: result.coupon.code,
            discountType: result.coupon.discountType,
            discountAmount: result.discountAmount
        };

        const shippingFee = subtotal > 999 ? 0 : 50;
        const finalTotal = subtotal - result.discountAmount + shippingFee;

        return res.status(200).json({
            success: true,
            message: "Coupon applied successfully!",
            breakdown: {
                subtotal,
                discount: result.discountAmount,
                shippingFee,
                finalTotal
            }
        });

    } catch (error) {
        console.error("applyCoupon Error:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
};

export const removeCoupon = async (req, res) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Please login." });
        }

        delete req.session.appliedCoupon;

        const cartData = await cartService.getCart(userId, 1, 100);
        let subtotal = 0;
        if (cartData && cartData.items.length > 0) {
            cartData.items.forEach(item => {
                if (item.product.isActive && !item.product.isDeleted) {
                    const variant = item.product.variants.find(v => v.size === item.size && v.color && v.color.name === item.color);
                    const availableStock = variant ? variant.stock : 0;
                    if (availableStock >= item.quantity) {
                        subtotal += item.totalPrice;
                    }
                }
            });
        }

        const shippingFee = subtotal > 999 ? 0 : 50;
        const finalTotal = subtotal + shippingFee;

        return res.status(200).json({
            success: true,
            message: "Coupon removed successfully!",
            breakdown: {
                subtotal,
                discount: 0,
                shippingFee,
                finalTotal
            }
        });

    } catch (error) {
        console.error("removeCoupon Error:", error);
        return res.status(500).json({ success: false, message: "Failed to remove coupon." });
    }
};

export const getAvailableCoupons = async (req, res) => {
    try {
        const now = new Date();
        const coupons = await Coupon.find({
            isActive: true,
            isDeleted: false,
            expiryDate: { $gt: now },
            $expr: { $lt: ['$usedCount', '$usageLimit'] }
        })
        .select('code description discountType discountValue minimumAmount maximumDiscount expiryDate')
        .sort({ createdAt: -1 })
        .lean();

        return res.status(200).json({ success: true, coupons });
    } catch (error) {
        console.error("getAvailableCoupons Error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch coupons." });
    }
};
