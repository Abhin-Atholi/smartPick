import { formatCurrency } from '../../utils/currencyHelper.js';
import { getOrderStatusBadge, getItemStatusBadge, getPaymentStatusBadge } from './orderPresentationService.js';

export const formatAdminOrderForDisplay = (order) => {
    // 1. Process Items
    const formattedItems = order.items.map(item => {
        const originalPrice = item.originalPrice && !isNaN(item.originalPrice) ? item.originalPrice : (item.price || 0);
        const finalPrice = item.price || 0;
        const offerDiscount = item.offerApplied?.discountAmount || (item.discountAmount * item.quantity) || 0;
        const couponAllocated = item.couponAllocated || 0;
        const taxAmount = item.taxAmount || 0;
        
        const finalPaidAmount = item.finalPriceAfterCoupon || item.totalPrice || (finalPrice * item.quantity);
        const totalOriginalAmount = originalPrice * item.quantity;

        const colorOpt = item.product?.colorOptions?.find(c => c.name === item.color);
        const image = item.image || colorOpt?.images?.[0] || item.product?.defaultImage || '/images/placeholder.jpg';

        // Refund Specific Fields
        let refundStatus = null;
        if (item.refundProcessed) {
            refundStatus = {
                transactionId: item.refundTransactionId,
                processedAt: item.refundProcessedAt ? new Date(item.refundProcessedAt).toLocaleString('en-GB') : 'N/A',
                amount: formatCurrency(finalPaidAmount),
                type: item.itemStatus === 'Returned' ? 'Return' : 'Cancel'
            };
        }

        return {
            _id: item._id,
            productId: item.product?._id || item.product,
            productName: item.product?.name || 'Product Unavailable',
            categoryName: item.product?.category?.name || '',
            size: item.size,
            color: item.color,
            quantity: item.quantity,
            image,
            
            // Raw Financials
            originalPrice,
            finalPrice,
            offerDiscount,
            couponAllocated,
            taxAmount,
            finalPaidAmount,
            totalOriginalAmount,

            // Formatted Financials
            formatted: {
                unitPrice: formatCurrency(finalPrice),
                totalOriginalAmount: formatCurrency(totalOriginalAmount),
                offerDiscount: formatCurrency(offerDiscount),
                couponAllocated: formatCurrency(couponAllocated),
                taxAmount: formatCurrency(taxAmount),
                finalPaidAmount: formatCurrency(finalPaidAmount)
            },

            // Status and Badges
            status: item.itemStatus,
            badge: getItemStatusBadge(item.itemStatus),
            refundProcessed: !!item.refundProcessed,
            refundStatus,
            
            canCancel: !['Cancelled', 'Returned', 'Return Rejected', 'Shipped', 'Out for Delivery', 'Delivered', 'Return Requested'].includes(item.itemStatus),
            canApproveReturn: item.itemStatus === 'Return Requested',
            canReturn: false, // Used by user side, admins don't request returns
            
            // Phase 7 Return Inspection & Inventory Reconciliation
            inventoryReconciled: !!item.inventoryReconciled,
            returnInspection: item.returnInspection || null,

            // Phase 9 Safety Flags
            isCapped: !!item.isCapped,
            isFloorHit: !!item.isFloorHit,
            pricingAdjusted: !!item.pricingAdjusted
        };
    });

    // 2. Process Summary
    const rawSubtotal = isNaN(order.originalSubtotal) ? (order.subtotal || 0) : (order.originalSubtotal || order.subtotal || 0);
    const rawOfferDiscount = !isNaN(order.totalOfferDiscount) ? order.totalOfferDiscount : 0;
    const rawCoupon = !isNaN(order.discount) ? order.discount : 0;
    const rawTax = !isNaN(order.tax) ? order.tax : 0;
    const rawShipping = !isNaN(order.shippingFee) ? order.shippingFee : 0;
    const rawTotal = !isNaN(order.totalAmount) ? order.totalAmount : 0;

    const summary = {
        subtotal: rawSubtotal,
        offerDiscount: rawOfferDiscount,
        couponDiscount: rawCoupon,
        tax: rawTax,
        shipping: rawShipping,
        total: rawTotal,
        
        formatted: {
            subtotal: formatCurrency(rawSubtotal),
            offerDiscount: formatCurrency(rawOfferDiscount),
            couponDiscount: formatCurrency(rawCoupon),
            tax: formatCurrency(rawTax),
            shipping: rawShipping === 0 ? 'Free' : formatCurrency(rawShipping),
            total: formatCurrency(rawTotal)
        },
        
        hasOfferDiscount: rawOfferDiscount > 0,
        hasCouponDiscount: rawCoupon > 0,

        // Phase 9 Summary Safety Flags
        pricingAdjusted: !!order.pricingAdjusted,
        couponCapped: !!order.couponCapped
    };

    // 3. Admin Specifics & Final Output
    const orderIdDisplay = order.orderId || `#${order._id.toString().slice(-6).toUpperCase()}`;

    return {
        _id: order._id,
        orderId: orderIdDisplay,
        createdAt: order.createdAt,
        formattedDate: new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        
        status: order.orderStatus,
        statusBadge: getOrderStatusBadge(order.orderStatus),
        
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        paymentBadge: getPaymentStatusBadge(order.paymentStatus),
        paymentDetails: order.paymentDetails,
        
        user: order.user,
        
        isDelivered: order.orderStatus === 'Delivered',
        canUpdateStatus: !['Delivered', 'Return Requested', 'Returned', 'Cancelled'].includes(order.orderStatus),
        
        items: formattedItems,
        summary,
        lifecycleHistory: formatLifecycleHistory(order.lifecycleHistory)
    };
};

// ── Task 5: Lifecycle History Presentation ───────────────────────────────────

const ACTION_LABELS = {
    'ADMIN_CANCELLED_ORDER':  'Order Cancelled',
    'USER_CANCELLED_ORDER':   'Order Cancelled (User)',
    'ITEM_CANCELLED':         'Item Cancelled',
    'ADMIN_UPDATED_STATUS':   'Status Updated',
    'ADMIN_APPROVED_RETURN':  'Return Approved',
    'ADMIN_REJECTED_RETURN':  'Return Rejected',
    'USER_REQUESTED_RETURN':  'Return Requested',
    'INVENTORY_RESTORED':     'Stock Restored',
    'PAYMENT_EXPIRED':        'Payment Expired',
    'SYSTEM_CLEANUP':         'System Cleanup',
};

const ACTOR_TYPE_LABELS = {
    'User':   'Customer',
    'Admin':  'Admin',
    'System': 'System',
};

/**
 * Normalize lifecycle history entries for safe presentation.
 * Handles both new polymorphic schema and legacy flat entries.
 *
 * @param {Array} history - Raw lifecycleHistory from Order document
 * @returns {Array} Normalized display-ready entries
 */
export const formatLifecycleHistory = (history = []) => {
    if (!Array.isArray(history)) return [];

    return history.map(entry => {
        // Detect new polymorphic schema vs legacy schema
        const isNew = entry.actorModel !== undefined;

        // Actor display
        const actorModel     = entry.actorModel || null;
        const actorTypeLabel = ACTOR_TYPE_LABELS[actorModel] || 'Legacy Event';

        // Status transitions — new schema uses fromStatus/toStatus; legacy used prevStatus/nextStatus
        const fromStatus = entry.fromStatus || entry.prevStatus || null;
        const toStatus   = entry.toStatus   || entry.nextStatus || null;

        // Timestamp — new schema uses createdAt; legacy used timestamp
        const rawTimestamp = entry.createdAt || entry.timestamp || null;
        const formattedTimestamp = rawTimestamp
            ? new Date(rawTimestamp).toLocaleString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })
            : 'Unknown time';

        // Reason — new schema uses reason; legacy used notes
        const reason = entry.reason || entry.notes || null;

        return {
            action:           entry.action || 'UNKNOWN',
            actionLabel:      ACTION_LABELS[entry.action] || entry.action || 'Unknown Event',
            actorTypeLabel,
            fromStatus,
            toStatus,
            reason,
            metadata:         entry.metadata || null,
            formattedTimestamp,
            isSystemEvent:    actorModel === 'System' || (!isNew && !entry.actor),
            isLegacy:         !isNew
        };
    }).reverse(); // Most recent first
};
