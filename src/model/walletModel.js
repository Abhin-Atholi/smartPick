import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
    type: { type: String, enum: ['Credit', 'Debit'], required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    method: {
        type: String,
        enum: ['Referral', 'Refund', 'Purchase', 'Admin Credit', 'Order Payment', 'Top-up'],
        default: 'Refund'
    },
    status: { type: String, enum: ['Completed', 'Pending'], default: 'Completed' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null }
}, { timestamps: true });

const walletSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
    transactions: [transactionSchema]
}, { timestamps: true });

export default mongoose.model("Wallet", walletSchema);
