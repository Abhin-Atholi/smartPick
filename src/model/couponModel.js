import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
    code: { 
        type: String, 
        required: true, 
        unique: true, 
        uppercase: true, 
        trim: true 
    },
    description: { 
        type: String 
    },
    discountType: { 
        type: String, 
        enum: ['flat', 'percentage'], 
        required: true 
    },
    discountValue: { 
        type: Number, 
        required: true, 
        min: 1 
    },
    minimumAmount: { 
        type: Number, 
        required: true, 
        min: 0 
    },
    maximumDiscount: { 
        type: Number, 
        min: 0 
    },
    usageLimit: { 
        type: Number, 
        required: true, 
        min: 1 
    },
    usedCount: { 
        type: Number, 
        default: 0 
    },
    usedBy: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    }],
    startDate: {
        type: Date,
        default: Date.now
    },
    expiryDate: { 
        type: Date, 
        required: true 
    },
    isActive: { 
        type: Boolean, 
        default: true 
    },
    isDeleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const Coupon = mongoose.model('Coupon', couponSchema);
export default Coupon;
