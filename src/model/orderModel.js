import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true },
    variantId: { type: mongoose.Schema.Types.ObjectId, required: false },
    size: { type: String, required: true },
    color: { type: String, required: true },
    price: { type: Number, required: true }, // This will store the final price per unit
    originalPrice: { type: Number }, // Original price before any offer
    discountAmount: { type: Number, default: 0 }, // Discount per unit
    totalPrice: { type: Number, required: true }, // Final price * quantity
    offerApplied: {
        offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer' },
        offerName: { type: String },
        offerType: { type: String },
        discountType: { type: String },
        discountAmount: { type: Number } // This is the total discount for all units of this item
    },
    // Phase 2: Immutable Financial Snapshots
    couponAllocated: { type: Number, default: 0 },
    taxableAmount: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    finalPriceAfterCoupon: { type: Number, default: 0 },
    
    // Phase 9: Pricing Safety Flags
    isCapped: { type: Boolean, default: false },
    isFloorHit: { type: Boolean, default: false },
    pricingAdjusted: { type: Boolean, default: false },
    
    // Phase 3: Idempotency & Refund Tracking
    refundProcessed: { type: Boolean, default: false },
    refundProcessedAt: { type: Date },
    refundTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction' },
    
    itemStatus: { type: String, enum: ['Payment Pending', 'Payment Failed', 'Expired', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested',"Out for Delivery", 'Returned', 'Return Rejected'], default: 'Processing' },
    cancelReason: { type: String },
    returnReason: { type: String },

    // Phase 7: Return Inspection & Inventory Reconciliation
    inventoryReconciled: { type: Boolean, default: false },
    inventoryReconciledAt: { type: Date },
    returnInspection: {
        status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Damaged', 'Restockable', 'Non-Restockable'] },
        notes: { type: String },
        restockable: { type: Boolean },
        inspectedAt: { type: Date },
        inspectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
});

const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true, sparse: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [orderItemSchema],
    shippingAddress: {
        fullName: String,
        phone: String,
        addressLine1: String,
        addressLine2: String,
        city: String,
        state: String,
        postalCode: String,
        country: String
    },
    originalSubtotal: { type: Number }, // Sum of (item.originalPrice * quantity)
    totalOfferDiscount: { type: Number, default: 0 }, // Sum of offer discounts
    subtotal: { type: Number, required: true }, // After offers, before coupon
    shippingFee: { type: Number, required: true },
    tax: { type: Number, required: true },
    discount: { type: Number, default: 0 }, // Coupon discount
    walletAmountUsed: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['COD', 'Razorpay', 'Wallet'], required: true },
    paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Failed', 'Refunded', 'Expired'], default: 'Pending' },
    orderStatus: { type: String, enum: ['Payment Pending', 'Payment Failed', 'Expired', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', "Out for Delivery",'Returned', 'Return Rejected'], default: 'Processing' },
    couponApplied: {
        code: { type: String },
        discountAmount: { type: Number },
        discountType: { type: String }
    },
    // Phase 9: Pricing Safety Flags
    pricingAdjusted: { type: Boolean, default: false },
    couponCapped: { type: Boolean, default: false },
    
    paymentDetails: {
        razorpayOrderId: { type: String },
        razorpayPaymentId: { type: String },
        razorpaySignature: { type: String },
        failedAttempts: { type: Number, default: 0 },
        retryExpiryTime: { type: Date } // legacy field
    },
    retryExpiresAt: { type: Date },
    stockRestored: { type: Boolean, default: false },
    cancelReason: { type: String },
    returnReason: { type: String },
    
    // ── Phase 8: Polymorphic Lifecycle Audit Trail ────────────────────────────
    // actor is nullable — System events have no actor ObjectId.
    // actorModel drives the refPath so Mongoose knows which collection to populate.
    lifecycleHistory: [{
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'lifecycleHistory.actorModel',
            default: null
        },
        actorModel: {
            type: String,
            enum: ['User', 'Admin', 'System'],
            default: 'System'
        },
        action:     { type: String, required: true },
        fromStatus: { type: String },
        toStatus:   { type: String },
        reason:     { type: String },
        metadata:   { type: mongoose.Schema.Types.Mixed },
        createdAt:  { type: Date, default: Date.now }
    }]
}, { timestamps: true });

// ── Phase 8: Production Indexes ─────────────────────────────────────────────
// User order history (most common query)
orderSchema.index({ user: 1, createdAt: -1 });
// Admin order listing with status filter
orderSchema.index({ orderStatus: 1, createdAt: -1 });
// Payment reconciliation
orderSchema.index({ paymentStatus: 1, paymentMethod: 1 });
// Expired order cleanup cron
orderSchema.index({ orderStatus: 1, stockRestored: 1, retryExpiresAt: 1 });
// Return management
orderSchema.index({ 'items.itemStatus': 1 });
// Refund tracking
orderSchema.index({ 'items.refundProcessed': 1, paymentStatus: 1 });
// Inventory reconciliation audit
orderSchema.index({ 'items.inventoryReconciled': 1 });
// Analytics time-series aggregations
orderSchema.index({ createdAt: -1 });

export default mongoose.model("Order", orderSchema);
