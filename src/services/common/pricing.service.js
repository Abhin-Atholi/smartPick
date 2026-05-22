import * as taxHelper from '../../utils/taxHelper.js';
import { PRICING_RULES } from '../../config/pricingRules.js';
import { SHIPPING_RULES } from '../../config/storeConfig.js';

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
    if (!offer) return { discount: 0, isCapped: false, isFloorHit: false };
    
    const price = Number(basePrice) || 0;
    const discountValue = Number(offer.discountValue) || 0;
    
    let discount = 0;
    let isCapped = false;
    
    if (offer.discountType === 'flat') {
        discount = discountValue;
    } else if (offer.discountType === 'percentage') {
        const safeDiscountValue = Math.min(discountValue, PRICING_RULES.MAX_PERCENTAGE_DISCOUNT);
        discount = (price * safeDiscountValue) / 100;
        if (offer.maximumDiscountAmount && discount > offer.maximumDiscountAmount) {
            discount = offer.maximumDiscountAmount;
            isCapped = true;
        }
    }

    const maxAllowed = Math.max(0, price - PRICING_RULES.MINIMUM_ITEM_PRICE);
    let isFloorHit = false;
    if (discount > maxAllowed) {
        discount = maxAllowed;
        isFloorHit = true;
    }

    return { discount, isCapped, isFloorHit };
};

/**
 * Calculates the final price for a single item (variant) given its base price and an array of applicable offers.
 * @param {number} basePrice - The original MRP of the variant
 * @param {Array} applicableOffers - Array of active offers for the product/category
 * @returns {Object} Normalized pricing object
 */
export const calculateItemPrice = (basePrice, applicableOffers = []) => {
    const price = Number(basePrice) || 0;
    let bestResult = { discount: 0, isCapped: false, isFloorHit: false };
    let bestOffer = null;

    for (const offer of applicableOffers) {
        const result = calculateDiscountAmount(price, offer);
        if (result.discount > bestResult.discount) {
            bestResult = result;
            bestOffer = offer;
        }
    }

    const discountAmount = roundCurrency(bestResult.discount);
    const finalPrice = Math.max(roundCurrency(price - discountAmount), price > 0 ? PRICING_RULES.MINIMUM_ITEM_PRICE : 0);
    const effectiveDiscountPercent = price > 0 ? Math.round((discountAmount / price) * 100) : 0;

    return {
        originalPrice: price,
        finalPrice,
        discountAmount,
        effectiveDiscountPercent,
        isCapped: bestResult.isCapped,
        isFloorHit: bestResult.isFloorHit,
        appliedOffer: bestOffer ? {
            offerId: bestOffer._id || bestOffer.offerId,
            name: bestOffer.name || bestOffer.offerName,
            offerType: bestOffer.offerType,
            discountType: bestOffer.discountType,
            discountValue: bestOffer.discountValue,
            maximumDiscountAmount: bestOffer.maximumDiscountAmount
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
            couponDiscount = Number(couponData.discountValue || couponData.discountAmount || 0);
        } else if (couponData.discountType === 'percentage') {
            // ALWAYS use discountValue (the percentage) first.
            const percentage = Number(couponData.discountValue);
            if (isNaN(percentage) || percentage <= 0) {
                // Robust Fallback: If discountValue is missing (e.g. legacy session), treat the pre-calculated discountAmount as a flat discount
                couponDiscount = Number(couponData.discountAmount || 0);
            } else {
                couponDiscount = (subtotal * percentage) / 100;
            }
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
            couponAllocated = roundCurrency((processed.finalPriceBeforeCoupon / subtotal) * couponDiscount);
        }
        processed.couponAllocated = couponAllocated;
        return processed;
    });

    // Failsafe & Redistribution Phase for Coupons
    let unallocatedCoupon = 0;
    let couponAdjusted = false;
    
    processedItems.forEach(processed => {
        const quantity = processed.quantity || 1;
        const minAllowedPriceBeforeTax = PRICING_RULES.MINIMUM_ITEM_PRICE * quantity;
        
        // Auto-cap to ensure final price doesn't drop below floor
        const maxAllowedCoupon = Math.max(0, processed.finalPriceBeforeCoupon - minAllowedPriceBeforeTax);
        
        if (processed.couponAllocated > maxAllowedCoupon) {
            unallocatedCoupon += (processed.couponAllocated - maxAllowedCoupon);
            processed.couponAllocated = maxAllowedCoupon;
            couponAdjusted = true;
        }
    });

    // Redistribute leftover coupon to other eligible items
    if (unallocatedCoupon > 0) {
        for (let i = 0; i < processedItems.length && unallocatedCoupon > 0.01; i++) {
            const processed = processedItems[i];
            const quantity = processed.quantity || 1;
            const minAllowedPriceBeforeTax = PRICING_RULES.MINIMUM_ITEM_PRICE * quantity;
            const maxAllowedCoupon = Math.max(0, processed.finalPriceBeforeCoupon - minAllowedPriceBeforeTax);
            
            const remainingCapacity = maxAllowedCoupon - processed.couponAllocated;
            if (remainingCapacity > 0) {
                const amountToAdd = Math.min(remainingCapacity, unallocatedCoupon);
                processed.couponAllocated += amountToAdd;
                unallocatedCoupon -= amountToAdd;
            }
        }
    }

    // Final round and sum of allocated coupons
    processedItems.forEach((processed, index) => {
        processed.couponAllocated = roundCurrency(processed.couponAllocated);
        // Correct last item rounding leak
        if (index === processedItems.length - 1 && Math.abs(couponDiscount - allocatedCouponTotal - unallocatedCoupon) < 0.05 && unallocatedCoupon <= 0.01) {
            const quantity = processed.quantity || 1;
            const minAllowedPriceBeforeTax = PRICING_RULES.MINIMUM_ITEM_PRICE * quantity;
            const maxAllowedCoupon = Math.max(0, processed.finalPriceBeforeCoupon - minAllowedPriceBeforeTax);
            const proposed = processed.couponAllocated + (couponDiscount - allocatedCouponTotal - processed.couponAllocated);
            if (proposed >= 0 && proposed <= maxAllowedCoupon) {
                 processed.couponAllocated = roundCurrency(proposed);
            }
        }
        allocatedCouponTotal = roundCurrency(allocatedCouponTotal + processed.couponAllocated);
        
        // b) Tax Allocation (Item level rules)
        processed.taxableAmount = roundCurrency(processed.finalPriceBeforeCoupon - processed.couponAllocated);
        processed.taxAmount = roundCurrency(taxHelper.calculateTax(processed.taxableAmount));
        
        totalTaxableAmount = roundCurrency(totalTaxableAmount + processed.taxableAmount);
        totalTaxAmount = roundCurrency(totalTaxAmount + processed.taxAmount);

        // c) Final Item Price (Sum of taxable + tax)
        processed.finalPriceAfterCoupon = roundCurrency(processed.taxableAmount + processed.taxAmount);
        
        // Expose item-level safety flags
        processed.pricingAdjusted = processed.isCapped || processed.isFloorHit || (couponAdjusted && processed.couponAllocated > 0);
    });

    // 4. Handle Shipping
    const amountForShippingCheck = subtotal;
    const shippingFee = (amountForShippingCheck >= SHIPPING_RULES.FREE_SHIPPING_THRESHOLD || amountForShippingCheck === 0) ? 0 : SHIPPING_RULES.STANDARD_SHIPPING_FEE;

    // 5. Final Grand Total
    const totalAmount = roundCurrency(totalTaxableAmount + totalTaxAmount + shippingFee);
    const totalSavings = roundCurrency(offerDiscount + allocatedCouponTotal);

    const pricingAdjusted = processedItems.some(i => i.pricingAdjusted) || (couponDiscount > allocatedCouponTotal + 0.01);

    return {
        items: processedItems,
        breakdown: {
            originalSubtotal,
            offerDiscount,
            subtotal,
            couponDiscount: allocatedCouponTotal,
            taxableAmount: totalTaxableAmount,
            tax: totalTaxAmount,
            shippingFee,
            totalAmount,
            totalSavings,
            pricingAdjusted,
            couponCapped: couponData?.maximumDiscount && couponDiscount >= couponData.maximumDiscount
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

/**
 * Validates the financial integrity of an order.
 * @param {Object} order - The order object to validate
 * @returns {boolean} True if financials are mathematically consistent
 */
export const validateOrderFinancials = (order) => {
    try {
        let itemsSum = 0;
        let couponSum = 0;
        
        for (const item of order.items) {
            itemsSum += Number(item.finalPriceAfterCoupon) || Number(item.totalPrice) || 0;
            couponSum += Number(item.couponAllocated) || 0;
        }
        
        itemsSum = roundCurrency(itemsSum);
        couponSum = roundCurrency(couponSum);
        
        const shipping = Number(order.shippingFee) || 0;
        const totalAmount = Number(order.totalAmount) || 0;
        const tax = Number(order.tax) || 0;
        
        // Final Payable should be exactly sum of all item final prices + shipping
        // (Note: finalPriceAfterCoupon already includes tax in Phase 2)
        const expectedTotal = roundCurrency(itemsSum + shipping);
        
        if (Math.abs(expectedTotal - totalAmount) > 0.05) {
            console.warn(`[PRICING INTEGRITY WARNING] Grand total mismatch on order ${order._id}. Expected: ${expectedTotal}, Actual: ${totalAmount}`);
            return false;
        }
        
        // Also check if coupon allocation matches order level discount
        const orderCoupon = Number(order.discount) || 0;
        if (Math.abs(couponSum - orderCoupon) > 0.05) {
            console.warn(`[PRICING INTEGRITY WARNING] Coupon mismatch on order ${order._id}. Item sum: ${couponSum}, Order: ${orderCoupon}`);
            return false;
        }
        
        return true;
    } catch (err) {
        console.error('Error in validateOrderFinancials:', err);
        return false;
    }
};
