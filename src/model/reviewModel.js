import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    reviewText: {
        type: String,
        trim: true,
        maxlength: 1000
    },
    userNameSnapshot: {
        type: String,
        required: true
    },
    isEdited: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Ensure a user can only review a product once
reviewSchema.index({ userId: 1, productId: 1 }, { unique: true });

// Indexes for performance when fetching reviews for a product
reviewSchema.index({ productId: 1, createdAt: -1 });
reviewSchema.index({ productId: 1, rating: -1 });

export default mongoose.model("ProductReview", reviewSchema);
