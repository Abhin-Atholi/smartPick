import { roundCurrency } from './pricing.service.js';

export const REFUND_TYPES = {
    FULL_CANCEL: 'FULL_CANCEL',
    PARTIAL_CANCEL: 'PARTIAL_CANCEL',
    RETURN: 'RETURN'
};

/**
 * Centralized Refund Engine
 * Calculates the exact eligible refund amount based on immutable order snapshots.
 * Enforces idempotency by skipping items that have already been refunded.
 *
 * @param {Object} params
 * @param {Object} params.order - The fully populated order document
 * @param {Array<string>} params.itemsToRefund - Array of item ID strings to refund
 * @param {string} params.refundType - 'FULL_CANCEL', 'PARTIAL_CANCEL', or 'RETURN'
 * @returns {Object} Standardized refund breakdown
 */
export const calculateRefund = ({ order, itemsToRefund, refundType }) => {
    let itemsRefund = 0;
    let shippingRefund = 0;
    const refundableItems = [];

    // Rule: COD orders do not receive wallet refunds during cancellation.
    // (Post-delivery returns for COD can be handled later, but for now, we follow standard MVP rules)
    const isPrepaid = ['Razorpay', 'Wallet'].includes(order.paymentMethod);
    
    // If not prepaid and it's a cancellation, total refund is 0.
    // Wait, if it's a return, even COD orders get a wallet refund.
    // Let's assume returns always refund to wallet regardless of payment method.
    const isEligibleForRefund = isPrepaid || refundType === REFUND_TYPES.RETURN;

    // Safety: Ensure itemsToRefund is an array
    const targetItemIds = Array.isArray(itemsToRefund) ? itemsToRefund.map(id => id.toString()) : [];

    // Loop through all items in the order
    order.items.forEach(item => {
        const itemId = item._id.toString();

        // Check if this item is part of the refund request
        if (!targetItemIds.includes(itemId)) {
            return;
        }

        // Idempotency Protection: Block double refunds
        // If refundProcessed is true, or item is already Cancelled/Returned, skip.
        // But wait, order status might be updated BEFORE or AFTER calculateRefund is called.
        // It's safest to rely on `refundProcessed` flag.
        if (item.refundProcessed) {
            return; // Skip, already refunded
        }

        let itemRefundAmount = 0;

        if (isEligibleForRefund) {
            // Priority 1: Phase 2 Immutable Snapshot Data
            if (item.finalPriceAfterCoupon !== undefined && item.finalPriceAfterCoupon > 0) {
                itemRefundAmount = item.finalPriceAfterCoupon;
            } 
            // Priority 2: Legacy Fallback for older orders
            else {
                // Approximate the refund based on total price + proportional tax
                const fallbackSubtotal = order.subtotal || 1; // Prevent division by zero
                const proportionalTax = (item.totalPrice / fallbackSubtotal) * (order.tax || 0);
                // We don't deduct proportional coupon here because legacy orders already had coupon deducted from `order.totalAmount`.
                // This is a rough fallback.
                itemRefundAmount = roundCurrency(item.totalPrice + proportionalTax);
            }
        }

        itemsRefund = roundCurrency(itemsRefund + itemRefundAmount);
        
        refundableItems.push({
            itemId: itemId,
            productId: item.product.toString(),
            refundAmount: itemRefundAmount
        });
    });

    // Shipping Refund Rules: Shipping is non-refundable in all scenarios.
    // Even in FULL_CANCEL, we retain the shipping fee as a processing/service charge.
    shippingRefund = 0;

    const totalRefund = roundCurrency(itemsRefund + shippingRefund);

    return {
        refundableItems,
        breakdown: {
            itemsRefund,
            shippingRefund,
            totalRefund
        }
    };
};

