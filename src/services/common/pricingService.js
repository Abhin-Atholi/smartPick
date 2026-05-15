import * as taxHelper from '../../utils/taxHelper.js';

/**
 * Calculates the discount amount for a given price and offer.
 * @param {number} basePrice
 * @param {Object} offer
 * @returns {number}
 */
const calculateDiscountAmount = (basePrice, offer) => {
    if (!offer) return 0;
    
    const price = Number(basePrice) || 0;
    const discountValue = Number(offer.discountValue) || 0;
    
    let discount = 0;
    if (offer.discountType === 'flat') {
        discount = discountValue;
    } else if (offer.discountType === 'percentage') {
        const safeDiscountValue = Math.min(discountValue, 90);
        discount = (price * safeDiscountValue) / 100;
    }

    return Math.min(discount, Math.max(0, price - 1));
};

/**
 * Calculates the final price for a single item (variant) given its base price and an array of applicable offers.
 * @param {number} basePrice - The original MRP of the variant
 * @param {Array} applicableOffers - Array of active offers for the product/category
 * @returns {Object} Normalized pricing object
 */
export const calculateItemPrice = (basePrice, applicableOffers = []) => {
    const price = Number(basePrice) || 0;
    let bestOffer = null;
    let bestDiscountAmount = 0;

    for (const offer of applicableOffers) {
        const discountAmount = calculateDiscountAmount(price, offer);
        if (discountAmount > bestDiscountAmount) {
            bestDiscountAmount = discountAmount;
            bestOffer = offer;
        }
    }

    const discountAmount = parseFloat(bestDiscountAmount.toFixed(2)) || 0;
    const finalPrice = Math.max(parseFloat((price - discountAmount).toFixed(2)), price > 0 ? 1 : 0);
    const effectiveDiscountPercent = price > 0 ? Math.round((discountAmount / price) * 100) : 0;

    return {
        originalPrice: price,
        finalPrice,
        discountAmount,
        effectiveDiscountPercent,
        appliedOffer: bestOffer ? {
            offerId: bestOffer._id || bestOffer.offerId,
            name: bestOffer.name || bestOffer.offerName,
            offerType: bestOffer.offerType,
            discountType: bestOffer.discountType,
            discountValue: bestOffer.discountValue
        } : null
    };
};

/**
 * Calculates the complete breakdown for a cart or order.
 * @param {Array} items - Array of items, each MUST already have originalPrice, finalPrice, discountAmount, and quantity
 * @param {Object|null} couponData - Optional coupon details
 * @returns {Object} Complete totals breakdown
 */
export const calculateOrderTotals = (items, couponData = null) => {
    let originalSubtotal = 0;
    let offerDiscount = 0;
    let subtotal = 0; // After offers, before coupon

    items.forEach(item => {
        const quantity = item.quantity || 1;
        const originalPrice = item.originalPrice || item.price || 0;
        const finalPrice = item.finalPrice || item.price || 0;
        const discountAmount = item.discountAmount || 0;

        originalSubtotal += (originalPrice * quantity);
        offerDiscount += (discountAmount * quantity);
        subtotal += (finalPrice * quantity);
    });

    // Handle Coupon
    let couponDiscount = 0;
    if (couponData) {
        if (couponData.discountType === 'flat') {
            couponDiscount = couponData.discountAmount || couponData.discountValue || 0;
        } else if (couponData.discountType === 'percentage') {
            couponDiscount = (subtotal * (couponData.discountAmount || couponData.discountValue || 0)) / 100;
        }
        
        // Ensure coupon discount doesn't exceed maximum discount limit if applicable
        if (couponData.maximumDiscount && couponDiscount > couponData.maximumDiscount) {
            couponDiscount = couponData.maximumDiscount;
        }

        // Coupon cannot exceed subtotal
        couponDiscount = Math.min(couponDiscount, subtotal);
    }

    // Handle Tax
    const taxableAmount = taxHelper.calculateTaxableAmount(subtotal, couponDiscount);
    const tax = taxHelper.calculateTax(taxableAmount);

    // Handle Shipping (Free shipping over ₹499)
    const SHIPPING_THRESHOLD = 499;
    const STANDARD_SHIPPING = 50;
    // Calculate shipping based on subtotal AFTER coupons (or before? standard ecommerce is usually before or after, let's use after coupon)
    const amountForShippingCheck = subtotal - couponDiscount;
    const shipping = amountForShippingCheck >= SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING;

    // Final Grand Total
    const grandTotal = Math.max(1, taxableAmount + tax + shipping);
    const totalSavings = offerDiscount + couponDiscount;

    return {
        originalSubtotal: parseFloat(originalSubtotal.toFixed(2)),
        offerDiscount: parseFloat(offerDiscount.toFixed(2)),
        subtotal: parseFloat(subtotal.toFixed(2)),
        couponDiscount: parseFloat(couponDiscount.toFixed(2)),
        taxableAmount: parseFloat(taxableAmount.toFixed(2)),
        tax: parseFloat(tax.toFixed(2)),
        shipping: parseFloat(shipping.toFixed(2)),
        grandTotal: parseFloat(grandTotal.toFixed(2)),
        totalSavings: parseFloat(totalSavings.toFixed(2))
    };
};
