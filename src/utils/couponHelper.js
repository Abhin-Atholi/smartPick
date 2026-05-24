import Coupon from '../model/couponModel.js';
import AppError from './AppError.js';

/**
 * Validates a coupon and calculates the applicable discount.
 * 
 * @param {string} couponCode - The code provided by the user.
 * @param {number} cartTotal - The user's cart total before discount.
 * @param {string|ObjectId} userId - The ID of the user attempting to use the coupon.
 * @returns {Promise<{coupon: object, discountAmount: number, finalPayable: number}>}
 */
export const validateAndCalculateDiscount = async (couponCode, cartTotal, userId) => {
    if (!couponCode) {
        throw new AppError("Invalid coupon code.", 400);
    }

    const codeToSearch = couponCode.toUpperCase().trim();
    const coupon = await Coupon.findOne({ code: codeToSearch, isDeleted: false });

    if (!coupon) {
        throw new AppError("Invalid coupon code.", 400);
    }

    if (!coupon.isActive) {
        throw new AppError("This coupon is currently inactive.", 400);
    }

    if (coupon.startDate && new Date(coupon.startDate) > new Date()) {
        throw new AppError("This coupon is not active yet.", 400);
    }

    if (new Date(coupon.expiryDate) < new Date()) {
        throw new AppError("This coupon has expired.", 400);
    }

    if (coupon.usedCount >= coupon.usageLimit) {
        throw new AppError("Coupon usage limit has been reached.", 400);
    }

    if (coupon.usedBy && coupon.usedBy.includes(userId)) {
        throw new AppError("You have already used this coupon.", 400);
    }

    if (cartTotal < coupon.minimumAmount) {
        throw new AppError(`Minimum purchase of ₹${coupon.minimumAmount} required to use this coupon.`, 400);
    }

    let discount = 0;

    if (coupon.discountType === 'flat') {
        discount = coupon.discountValue;
    } else if (coupon.discountType === 'percentage') {
        discount = (cartTotal * coupon.discountValue) / 100;
        if (coupon.maximumDiscount && coupon.maximumDiscount > 0) {
            discount = Math.min(discount, coupon.maximumDiscount);
        }
    }

    // Ensure discount does not exceed cartTotal
    discount = Math.min(discount, cartTotal);

    // Ensure the final payable amount is at least ₹1
    let finalPayable = cartTotal - discount;
    if (finalPayable < 1) {
        discount = cartTotal - 1;
        finalPayable = 1;
    }

    return {
        coupon,
        discountAmount: Number(discount.toFixed(2)),
        finalPayable: Number(finalPayable.toFixed(2))
    };
};
