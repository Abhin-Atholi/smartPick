import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true },
    size: { type: String, required: true },
    color: { type: String, required: true },
    price: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    itemStatus: { type: String, enum: ['Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Returned'], default: 'Processing' },
    cancelReason: { type: String },
    returnReason: { type: String }
});

const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
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
    subtotal: { type: Number, required: true },
    shippingFee: { type: Number, required: true },
    tax: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['COD', 'Razorpay', 'Wallet'], required: true },
    paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Failed', 'Refunded'], default: 'Pending' },
    orderStatus: { type: String, enum: ['Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Requested', 'Returned'], default: 'Processing' },
    cancelReason: { type: String },
    returnReason: { type: String }
}, { timestamps: true });

// Pre-save hook to generate orderId
orderSchema.pre('save', async function(next) {
    if (this.isNew) {
        const count = await mongoose.model('Order').countDocuments();
        this.orderId = `#SP-${10000 + count + 1}`;
    }
    next();
});

export default mongoose.model("Order", orderSchema);
