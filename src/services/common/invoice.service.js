import { formatAdminOrderForDisplay } from './adminOrderPresentation.service.js';

/**
 * Transforms an immutable order snapshot into normalized Invoice Data.
 * This object is fully independent of EJS or PDF libraries, making it 
 * universally usable across different renderer types.
 *
 * It strictly relies on the presentation layer, which internally handles 
 * legacy fallbacks and ensures NO live prices are ever fetched.
 */
export const buildInvoiceData = (order) => {
    // Rely on the existing admin formatter which already implements
    // Phase 2 snapshot extraction and legacy order fallbacks safely.
    const formattedOrder = formatAdminOrderForDisplay(order);

    // Structure specifically for Invoice Rendering (PDF or HTML)
    const invoiceNumber = `INV-${formattedOrder.orderId.replace('#', '')}`;
    
    // Group refunds for the summary
    const refundedItems = formattedOrder.items.filter(i => i.refundProcessed);
    let totalRefunded = 0;
    
    // We compute the raw sum from the item final amounts that were refunded
    refundedItems.forEach(i => {
        totalRefunded += i.finalPaidAmount;
    });

    const refundSummary = {
        hasRefunds: refundedItems.length > 0,
        refundedItems: refundedItems.map(i => ({
            productName: i.productName,
            transactionId: i.refundStatus?.transactionId,
            amount: i.refundStatus?.amount,
            processedAt: i.refundStatus?.processedAt
        })),
        totalRefundedAmount: formattedOrder.summary.formatted.total // If needed to show raw formatted string
        // Note: The actual mathematical sum could be converted back to formatCurrency if needed, 
        // but `refundedItems` already has `.amount` formatted.
    };

    return {
        invoiceNumber,
        invoiceDate: formattedOrder.formattedDate,
        customer: {
            name: formattedOrder.user?.fullName || 'Guest',
            email: formattedOrder.user?.email || 'N/A'
        },
        shippingAddress: formattedOrder.shippingAddress,
        payment: {
            method: formattedOrder.paymentMethod,
            status: formattedOrder.paymentStatus,
            badge: formattedOrder.paymentBadge
        },
        items: formattedOrder.items.map(item => ({
            productName: item.productName,
            categoryName: item.categoryName,
            size: item.size,
            color: item.color,
            quantity: item.quantity,
            
            // Raw values needed for layout
            rawFinalPaidAmount: item.finalPaidAmount,
            
            // Strings for printing
            formatted: {
                unitPrice: item.formatted.unitPrice,
                totalOriginalAmount: item.formatted.totalOriginalAmount,
                offerDiscount: item.formatted.offerDiscount,
                couponAllocated: item.formatted.couponAllocated,
                taxAmount: item.formatted.taxAmount,
                finalPaidAmount: item.formatted.finalPaidAmount
            },
            
            hasDiscount: item.hasDiscount,
            hasOffer: item.hasOffer,
            hasCoupon: item.hasCoupon,
            hasTax: item.hasTax,
            
            refundProcessed: item.refundProcessed
        })),
        summary: formattedOrder.summary,
        refundSummary
    };
};

