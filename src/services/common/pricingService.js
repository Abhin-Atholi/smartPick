import * as taxHelper from '../../utils/taxHelper.js';

/**
 * Ensures financial values are strictly rounded to 2 decimal places.
 * Used to prevent floating-point anomalies.
 */
export const roundCurrency = (value) => {
    return Math.round((Number(value) || 0) * 100) / 100;
};

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

    const discountAmount = roundCurrency(bestDiscountAmount);
    const finalPrice = Math.max(roundCurrency(price - discountAmount), price > 0 ? 1 : 0);
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
 * CORE PRICING ENGINE - Calculate Order Totals & Item Allocation
 * Phase 2: Single Source of Truth for order/cart breakdowns AND Item-Level Allocations.
 * @param {Array} items - Array of items with originalPrice, finalPrice, discountAmount, quantity
 * @param {Object|null} couponData - Optional coupon details
 * @returns {Object} { items: Array, breakdown: Object }
 */
export const calculateOrderTotals = (items, couponData = null) => {
    let originalSubtotal = 0;
    let offerDiscount = 0;
    let subtotal = 0; // After offers, before coupon

    // 1. Base item aggregation
    items.forEach(item => {
        const quantity = item.quantity || 1;
        const originalPrice = Number(item.originalPrice) || Number(item.price) || 0;
        const finalPrice = Number(item.finalPrice) || Number(item.price) || 0;
        const discountAmount = Number(item.discountAmount) || 0;

        originalSubtotal += (originalPrice * quantity);
        offerDiscount += (discountAmount * quantity);
        subtotal += (finalPrice * quantity);
    });

    originalSubtotal = roundCurrency(originalSubtotal);
    offerDiscount = roundCurrency(offerDiscount);
    subtotal = roundCurrency(subtotal);

    // 2. Handle Global Coupon Target
    let couponDiscount = 0;
    if (couponData) {
        if (couponData.discountType === 'flat') {
            couponDiscount = Number(couponData.discountAmount || couponData.discountValue || 0);
        } else if (couponData.discountType === 'percentage') {
            const percentage = Number(couponData.discountAmount || couponData.discountValue || 0);
            couponDiscount = (subtotal * percentage) / 100;
        }
        
        if (couponData.maximumDiscount && couponDiscount > couponData.maximumDiscount) {
            couponDiscount = Number(couponData.maximumDiscount);
        }

        couponDiscount = Math.min(couponDiscount, subtotal);
    }
    couponDiscount = roundCurrency(couponDiscount);

    // 3. Phase 2: Proportional Item-Level Allocation
    let allocatedCouponTotal = 0;
    let totalTaxAmount = 0;
    let totalTaxableAmount = 0;

    const processedItems = items.map((item, index) => {
        const processed = { ...item };
        const quantity = processed.quantity || 1;
        
        processed.originalPrice = Number(processed.originalPrice) || Number(processed.price) || 0;
        processed.offerDiscount = Number(processed.discountAmount) || 0;
        const itemFinalPrice = Number(processed.finalPrice) || Number(processed.price) || 0;
        
        processed.finalPriceBeforeCoupon = roundCurrency(itemFinalPrice * quantity);

        // a) Coupon Allocation (Proportional)
        let couponAllocated = 0;
        if (subtotal > 0 && couponDiscount > 0) {
            if (index === items.length - 1) {
                // Adjust the last item to prevent rounding mismatch leaks
                couponAllocated = roundCurrency(couponDiscount - allocatedCouponTotal);
            } else {
                couponAllocated = roundCurrency((processed.finalPriceBeforeCoupon / subtotal) * couponDiscount);
            }
        }
        
        // Failsafe bounds check
        couponAllocated = Math.max(0, Math.min(couponAllocated, processed.finalPriceBeforeCoupon));
        processed.couponAllocated = couponAllocated;
        allocatedCouponTotal = roundCurrency(allocatedCouponTotal + couponAllocated);

        // b) Tax Allocation (Item level rules)
        processed.taxableAmount = roundCurrency(processed.finalPriceBeforeCoupon - processed.couponAllocated);
        processed.taxAmount = roundCurrency(taxHelper.calculateTax(processed.taxableAmount));
        
        totalTaxableAmount = roundCurrency(totalTaxableAmount + processed.taxableAmount);
        totalTaxAmount = roundCurrency(totalTaxAmount + processed.taxAmount);

        // c) Final Item Price (Sum of taxable + tax)
        processed.finalPriceAfterCoupon = roundCurrency(processed.taxableAmount + processed.taxAmount);

        return processed;
    });

    // 4. Handle Shipping
    // Free shipping over ₹499 check is based on the final item value (post-coupon, pre-tax is typical, but we use taxableAmount)
    const SHIPPING_THRESHOLD = 499;
    const STANDARD_SHIPPING = 50;
    const amountForShippingCheck = subtotal - couponDiscount;
    const shippingFee = (amountForShippingCheck >= SHIPPING_THRESHOLD || amountForShippingCheck === 0) ? 0 : STANDARD_SHIPPING;

    // 5. Final Grand Total
    // By building the total exactly from the sum of items, we guarantee mathematical consistency.
    const totalAmount = roundCurrency(totalTaxableAmount + totalTaxAmount + shippingFee);
    const totalSavings = roundCurrency(offerDiscount + couponDiscount);

    return {
        items: processedItems,
        breakdown: {
            originalSubtotal,
            offerDiscount,
            subtotal,
            couponDiscount,
            taxableAmount: totalTaxableAmount,
            tax: totalTaxAmount,
            shippingFee,
            totalAmount,
            totalSavings
        }
    };
};

/**
 * Standardized wrapper to process a cart or order and return the uniform structure.
 * @param {Array} items - Items array
 * @param {Object|null} couponData - Optional coupon data
 * @returns {Object} { items, breakdown }
 */
export const processPricing = (items, couponData = null) => {
    return calculateOrderTotals(items, couponData);
};
