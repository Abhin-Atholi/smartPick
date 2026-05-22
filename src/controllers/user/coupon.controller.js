import * as couponHelper from '../../utils/couponHelper.js';
import * as cartService from '../../services/user/cart.service.js';
import Coupon from '../../model/couponModel.js';
import * as taxHelper from '../../utils/taxHelper.js';
import { SHIPPING_RULES } from '../../config/storeConfig.js';

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

        // Filter valid items (stock issues already handled in getCart for the totals mostly, but let's be safe)
        let effectiveSubtotal = 0;
        let originalSubtotal = 0;
        cartData.items.forEach(item => {
            let variant;
            if (item.variantId) {
                variant = item.product.variants.find(v => v._id.toString() === item.variantId.toString());
            } else {
                const normalize = str => String(str || '').trim().toLowerCase();
                variant = item.product.variants.find(v => normalize(v.size) === normalize(item.size) && normalize(v.color) === normalize(item.color));
            }
            const availableStock = variant ? variant.stock : 0;
            if (availableStock >= item.quantity) {
                effectiveSubtotal += item.effectiveTotalPrice;
                originalSubtotal += item.price * item.quantity;
            }
        });

        if (effectiveSubtotal === 0) {
            return res.status(400).json({ success: false, message: "No valid items in cart to apply coupon." });
        }

        const result = await couponHelper.validateAndCalculateDiscount(couponCode, effectiveSubtotal, userId);

        req.session.appliedCoupon = {
            code: result.coupon.code,
            discountType: result.coupon.discountType,
            discountValue: result.coupon.discountValue,
            discountAmount: result.discountAmount,
            maximumDiscount: result.coupon.maximumDiscount
        };

        const shippingFee = effectiveSubtotal >= SHIPPING_RULES.FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_RULES.STANDARD_SHIPPING_FEE;
        const taxableAmount = taxHelper.calculateTaxableAmount(effectiveSubtotal, result.discountAmount);
        const tax = taxHelper.calculateTax(taxableAmount);
        const finalTotal = effectiveSubtotal - result.discountAmount + shippingFee + tax;

        return res.status(200).json({
            success: true,
            message: "Coupon applied successfully!",
            breakdown: {
                originalSubtotal,
                totalOfferDiscount: originalSubtotal - effectiveSubtotal,
                subtotal: effectiveSubtotal,
                discount: result.discountAmount,
                tax,
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
        let effectiveSubtotal = 0;
        let originalSubtotal = 0;
        if (cartData && cartData.items.length > 0) {
            cartData.items.forEach(item => {
                let variant;
                if (item.variantId) {
                    variant = item.product.variants.find(v => v._id.toString() === item.variantId.toString());
                } else {
                    const normalize = str => String(str || '').trim().toLowerCase();
                    variant = item.product.variants.find(v => normalize(v.size) === normalize(item.size) && normalize(v.color) === normalize(item.color));
                }
                const availableStock = variant ? variant.stock : 0;
                if (availableStock >= item.quantity) {
                    effectiveSubtotal += item.effectiveTotalPrice;
                    originalSubtotal += item.price * item.quantity;
                }
            });
        }

        const shippingFee = effectiveSubtotal >= SHIPPING_RULES.FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_RULES.STANDARD_SHIPPING_FEE;
        const taxableAmount = taxHelper.calculateTaxableAmount(effectiveSubtotal, 0);
        const tax = taxHelper.calculateTax(taxableAmount);
        const finalTotal = effectiveSubtotal + shippingFee + tax;

        return res.status(200).json({
            success: true,
            message: "Coupon removed successfully!",
            breakdown: {
                originalSubtotal,
                totalOfferDiscount: originalSubtotal - effectiveSubtotal,
                subtotal: effectiveSubtotal,
                discount: 0,
                tax,
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
            startDate: { $lte: now },
            expiryDate: { $gt: now }
        })
        .select('code description discountType discountValue minimumAmount maximumDiscount expiryDate usedCount usageLimit')
        .sort({ createdAt: -1 })
        .lean();

        // Filter out those that hit limit
        const filteredCoupons = coupons.filter(c => (c.usedCount || 0) < (c.usageLimit || 0));

        return res.status(200).json({ success: true, coupons: filteredCoupons });
    } catch (error) {
        console.error("getAvailableCoupons Error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch coupons." });
    }
};

