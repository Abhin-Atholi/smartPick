/**
 * invoicePresentation.service.js
 *
 * Adapter layer between raw Order documents and invoiceGenerator.js.
 * The generator MUST only consume the object returned here — never raw order data.
 *
 * Invariants:
 *  - All financial fields use immutable item-level snapshots.
 *  - Dynamic recalculation of prices/taxes/discounts is FORBIDDEN here.
 *  - Falls back gracefully for legacy orders missing new ledger fields.
 */

const fmt = (n) => `Rs.${Number(n || 0).toFixed(2)}`;
const fmtNum = (n) => Number(n || 0);

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => {
    if (!d) return 'N/A';
    const dt = new Date(d);
    return `${pad(dt.getDate())} ${dt.toLocaleString('en', { month: 'short' })} ${dt.getFullYear()}`;
};
const fmtDatetime = (d) => {
    if (!d) return 'N/A';
    const dt = new Date(d);
    return `${fmtDate(d)}, ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
};

const INACTIVE_STATUSES = ['Cancelled', 'Returned', 'Return Rejected'];
const REFUND_STATUSES   = ['Cancelled', 'Returned'];

/**
 * Classify an item for invoice rendering.
 */
const classifyItem = (item) => {
    if (item.returnRejected) return 'rejected_return';
    if (item.itemStatus === 'Cancelled')         return 'cancelled';
    if (item.itemStatus === 'Returned')          return 'returned';
    if (item.itemStatus === 'Return Requested')  return 'return_pending';
    return 'active';
};

/**
 * Build a formatted invoice DTO from a raw populated order document.
 * @param {object} order  - Populated Mongoose Order document (lean OK)
 * @returns {object}      - Invoice DTO safe for PDF rendering
 */
export const buildInvoiceData = (order) => {
    const invoiceId  = order.orderId || `INV-${order._id.toString().slice(-6).toUpperCase()}`;
    const addr       = order.shippingAddress || {};
    const user       = order.user || {};

    // ── Company Info ──────────────────────────────────────────────────────────
    const company = {
        name:    'SmartPick Inc.',
        address: ['88 Design Avenue, Suite 400', 'Mumbai, MH 400001', 'India'],
        email:   'support@smartpick.com',
        phone:   '+91 98765 43210',
        gstin:   'PENDING_GSTIN',     // TODO: populate from env/config
        website: 'www.smartpick.com'
    };

    // ── Customer ──────────────────────────────────────────────────────────────
    const customer = {
        name:    user.fullName || addr.fullName || 'Customer',
        email:   user.email || '',
        phone:   addr.phone || '',
        address: [
            addr.addressLine1,
            addr.addressLine2,
            [addr.city, addr.state, addr.postalCode].filter(Boolean).join(', '),
            addr.country
        ].filter(Boolean)
    };

    // ── Order Meta ────────────────────────────────────────────────────────────
    const orderMeta = {
        invoiceId,
        orderId:        order.orderId || `#${order._id.toString().slice(-8).toUpperCase()}`,
        orderDate:      fmtDate(order.createdAt),
        downloadedAt:   fmtDatetime(new Date()),
        paymentMethod:  order.paymentMethod || 'N/A',
        paymentStatus:  order.paymentStatus || 'N/A',
        orderStatus:    order.orderStatus || 'N/A',
        isPaid:         order.paymentStatus === 'Paid'
    };

    // ── Items ─────────────────────────────────────────────────────────────────
    const items = (order.items || []).map(item => {
        const classification = classifyItem(item);
        const isInactive     = INACTIVE_STATUSES.includes(item.itemStatus) || item.returnRejected;

        // Use immutable snapshots only — never recalculate from live prices
        const originalPrice      = fmtNum(item.originalPrice || item.price);
        const finalPrice         = fmtNum(item.price);
        // offerApplied.discountAmount is per-unit; multiply by qty to get line total
        const offerDiscountTotal = item.offerApplied?.discountAmount
            ? fmtNum(item.offerApplied.discountAmount) * fmtNum(item.quantity)
            : fmtNum(item.discountAmount || 0);
        const couponAllocated    = fmtNum(item.couponAllocated);
        const taxAmount          = fmtNum(item.taxAmount);
        const qty                = fmtNum(item.quantity);
        const finalPaidAmount    = fmtNum(item.finalPriceAfterCoupon || item.totalPrice || (finalPrice * qty));
        const unitFinalPaid      = qty > 0 ? finalPaidAmount / qty : finalPrice;

        // Refund info
        const refundProcessed    = !!item.refundProcessed;
        const refundDate         = item.refundProcessedAt ? fmtDate(item.refundProcessedAt) : null;
        const refundTxnId        = item.refundTransactionId ? item.refundTransactionId.toString().slice(-8).toUpperCase() : null;

        // Inspection
        const inspection         = item.returnInspection || null;

        return {
            productName:     item.product?.name || item.productName || 'Product Unavailable',
            size:            item.size || '—',
            color:           item.color || '—',
            quantity:        qty,
            itemStatus:      item.itemStatus,
            classification,
            isInactive,
            returnRejected:  !!item.returnRejected,
            returnReason:    item.returnReason || null,
            rejectionNotes:  inspection?.notes || null,

            // Immutable financials
            originalPrice,
            finalPrice,
            offerDiscount:   offerDiscountTotal,
            couponAllocated,
            taxAmount,
            finalPaidAmount,
            unitFinalPaid,

            // Formatted
            fmt: {
                originalPrice:   fmt(originalPrice),
                finalPrice:      fmt(finalPrice),
                offerDiscount:   fmt(offerDiscountTotal),
                couponAllocated: fmt(couponAllocated),
                taxAmount:       fmt(taxAmount),
                finalPaidAmount: fmt(finalPaidAmount),
                unitFinalPaid:   fmt(unitFinalPaid),
            },

            // Refund
            refundProcessed,
            refundDate,
            refundTxnId,
            refundAmount:    refundProcessed ? fmt(finalPaidAmount) : null,
        };
    });

    // ── Original Purchase Summary (Immutable Snapshot) ─────────────────────────
    const rawSubtotal      = fmtNum(order.originalSubtotal || order.subtotal);
    const rawOfferDiscount = fmtNum(order.totalOfferDiscount);
    const rawCoupon        = fmtNum(order.discount);
    const rawTax           = fmtNum(order.tax);
    const rawShipping      = fmtNum(order.shippingFee);
    const rawTotal         = fmtNum(order.totalAmount);
    const taxableAmount    = rawSubtotal - rawOfferDiscount - rawCoupon;
    const cgst             = rawTax / 2;
    const sgst             = rawTax / 2;

    const originalSummary = {
        subtotal:        fmt(rawSubtotal),
        offerDiscount:   rawOfferDiscount > 0 ? fmt(rawOfferDiscount) : null,
        couponDiscount:  rawCoupon > 0 ? fmt(rawCoupon) : null,
        taxableAmount:   fmt(taxableAmount > 0 ? taxableAmount : rawSubtotal),
        shipping:        rawShipping === 0 ? 'Free' : fmt(rawShipping),
        totalPaid:       fmt(rawTotal),
        hasOfferDiscount: rawOfferDiscount > 0,
        hasCouponDiscount: rawCoupon > 0
    };

    // ── GST Breakdown ──────────────────────────────────────────────────────────
    const gstBreakdown = {
        taxableBase: fmt(taxableAmount > 0 ? taxableAmount : rawSubtotal),
        cgst:        fmt(cgst),
        cgstRate:    '2.5%',
        sgst:        fmt(sgst),
        sgstRate:    '2.5%',
        totalGst:    fmt(rawTax)
    };

    // ── Refund Ledger ──────────────────────────────────────────────────────────
    const refundEntries = items
        .filter(i => REFUND_STATUSES.includes(i.itemStatus) && i.refundProcessed)
        .map(i => ({
            productName:  i.productName,
            variant:      `${i.size} / ${i.color}`,
            qty:          i.quantity,
            itemStatus:   i.itemStatus,
            refundAmount: i.fmt.finalPaidAmount,
            refundDate:   i.refundDate || 'Processing',
            refundTxnId:  i.refundTxnId,
            returnReason: i.returnReason,
        }));

    // Items cancelled/returned but not yet refunded (e.g. COD)
    const pendingRefundEntries = items
        .filter(i => REFUND_STATUSES.includes(i.itemStatus) && !i.refundProcessed)
        .map(i => ({
            productName:  i.productName,
            variant:      `${i.size} / ${i.color}`,
            qty:          i.quantity,
            itemStatus:   i.itemStatus,
            refundAmount: i.fmt.finalPaidAmount,
            refundDate:   null,
            refundTxnId:  null,
            returnReason: i.returnReason,
        }));

    const refundLedger = {
        hasRefunds:   refundEntries.length > 0,
        hasPending:   pendingRefundEntries.length > 0,
        entries:      refundEntries,
        pendingEntries: pendingRefundEntries,
        totalRefunded: fmt(fmtNum(order.totalRefundedAmount))
    };

    // ── Active Financial State ─────────────────────────────────────────────────
    const rawActiveTotal    = fmtNum(order.activeTotal || order.totalAmount);
    const rawRefunded       = fmtNum(order.totalRefundedAmount);
    const netRetained       = rawActiveTotal; // activeTotal IS the retained amount

    const activeSummary = {
        show:            rawRefunded > 0,
        activeTotal:     fmt(rawActiveTotal),
        totalRefunded:   fmt(rawRefunded),
        netRetained:     fmt(netRetained),
        originalPaid:    fmt(rawTotal),
    };

    // ── Payment ───────────────────────────────────────────────────────────────
    const payment = {
        method:  order.paymentMethod || 'N/A',
        status:  order.paymentStatus || 'N/A',
        isPaid:  order.paymentStatus === 'Paid',
        details: order.paymentDetails || null
    };

    return {
        company,
        customer,
        orderMeta,
        items,
        originalSummary,
        gstBreakdown,
        refundLedger,
        activeSummary,
        payment,
        branding: {
            primaryColor:  '#4f46e5',
            accentColor:   '#6366f1',
            tagline:       'Premium Fashion & Lifestyle'
        }
    };
};

