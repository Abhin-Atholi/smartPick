import mongoose from "mongoose";
import crypto from "crypto";

const walletTransactionSchema = new mongoose.Schema({
    walletId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Wallet', 
        required: true 
    },
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    transactionId: { 
        type: String, 
        required: true, 
        unique: true,
        default: () => `TXN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
    },
    type: { 
        type: String, 
        enum: ['Credit', 'Debit'], 
        required: true 
    },
    amount: { 
        type: Number, 
        required: true,
        min: 0
    },
    description: { 
        type: String, 
        required: true 
    },
    method: {
        type: String,
        enum: ['Referral', 'Refund', 'Purchase', 'Order Payment', 'Top-up', 'Cancellation Refund'],
        required: true
    },
    status: { 
        type: String, 
        enum: ['Completed', 'Pending', 'Failed'], 
        default: 'Completed' 
    },
    orderId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Order', 
        default: null 
    }
}, { timestamps: true });

// Indexes for efficient querying and sorting
// NOTE: transactionId index is created automatically via unique:true on the field — do not duplicate here
walletTransactionSchema.index({ userId: 1 });
walletTransactionSchema.index({ walletId: 1 });
walletTransactionSchema.index({ orderId: 1 });
walletTransactionSchema.index({ createdAt: -1 });
// Phase 8: Compound index for analytics refund aggregations
walletTransactionSchema.index({ type: 1, status: 1, createdAt: -1 });

export default mongoose.model("WalletTransaction", walletTransactionSchema);
