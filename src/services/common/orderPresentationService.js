import { formatCurrency } from '../../utils/currencyHelper.js';

/**
 * Standardize order status badge styling
 */
export const getOrderStatusBadge = (status) => {
    let classes = '';
    let iconClass = '';
    switch (status) {
        case 'Delivered':
            classes = 'bg-green-100 text-green-700';
            iconClass = 'bg-green-500';
            break;
        case 'Cancelled':
        case 'Return Rejected':
            classes = 'bg-red-100 text-red-700';
            iconClass = 'bg-red-500';
            break;
        case 'Shipped':
            classes = 'bg-blue-100 text-blue-700';
            iconClass = 'bg-blue-500';
            break;
        case 'Return Requested':
        case 'Returned':
            classes = 'bg-orange-100 text-orange-700';
            iconClass = 'bg-orange-500';
            break;
        default:
            classes = 'bg-yellow-100 text-yellow-800';
            iconClass = 'bg-yellow-500';
            break;
    }
    return { text: status, classes, iconClass };
};

/**
 * Standardize item status badge styling
 */
export const getItemStatusBadge = (status) => {
    let classes = '';
    switch (status) {
        case 'Delivered': classes = 'bg-green-50 text-green-700'; break;
        case 'Cancelled':
        case 'Return Rejected': classes = 'bg-red-50 text-red-700'; break;
        case 'Returned':
        case 'Return Requested': classes = 'bg-orange-50 text-orange-700'; break;
        case 'Shipped': classes = 'bg-blue-50 text-blue-700'; break;
        default: classes = 'bg-yellow-50 text-yellow-700'; break;
    }
    return { text: status, classes };
};

/**
 * Standardize payment status badge
 */
export const getPaymentStatusBadge = (status) => {
    let classes = '';
    let iconClass = '';
    switch (status) {
        case 'Paid':
            classes = 'text-green-600';
            iconClass = 'bg-green-500';
            break;
        case 'Refunded':
            classes = 'text-orange-600';
            iconClass = 'bg-orange-500';
            break;
        case 'Failed':
        case 'Expired':
            classes = 'text-red-600';
            iconClass = 'bg-red-500';
            break;
        default:
            classes = 'text-yellow-600';
            iconClass = 'bg-yellow-500';
            break;
    }
    return { text: status, classes, iconClass };
};

export const formatOrderForDisplay = (order) => {
    // 1. Process Items
    const formattedItems = order.items.map(item => {
        // Fallback Logic: if Phase 2 snapshots are missing, calculate approximations
        const originalPrice = item.originalPrice && !isNaN(item.originalPrice) ? item.originalPrice : (item.price || 0);
        const finalPrice = item.price || 0;
        const offerDiscount = item.offerApplied?.discountAmount || (item.discountAmount * item.quantity) || 0;
        const couponAllocated = item.couponAllocated || 0;
        const taxAmount = item.taxAmount || 0;
        
        // Final Paid Amount: prioritize Phase 2 `finalPriceAfterCoupon`, else fallback
        const finalPaidAmount = item.finalPriceAfterCoupon || item.totalPrice || (finalPrice * item.quantity);
        const totalOriginalAmount = originalPrice * item.quantity;

        // Visual properties
        const colorOpt = item.product?.colorOptions?.find(c => c.name === item.color);
        const image = item.image || colorOpt?.images?.[0] || item.product?.defaultImage || '/images/placeholder.jpg';

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
            
            // Permissions and Flags
            canCancel: ['Processing', 'Payment Pending', 'Payment Failed'].includes(item.itemStatus),
            canReturn: item.itemStatus === 'Delivered',
            hasOffer: offerDiscount > 0,
            hasCoupon: couponAllocated > 0,
            hasTax: taxAmount > 0,
            hasDiscount: totalOriginalAmount > finalPaidAmount
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
        hasCouponDiscount: rawCoupon > 0
    };

    // 3. Final Output
    return {
        _id: order._id,
        orderId: order.orderId || `#${order._id.toString().slice(-6).toUpperCase()}`,
        createdAt: order.createdAt,
        formattedDate: new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
        
        status: order.orderStatus,
        statusBadge: getOrderStatusBadge(order.orderStatus),
        
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        paymentBadge: getPaymentStatusBadge(order.paymentStatus),
        paymentDetails: order.paymentDetails,
        
        shippingAddress: order.shippingAddress,
        
        items: formattedItems,
        summary
    };
};
