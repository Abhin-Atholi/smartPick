import mongoose from 'mongoose';

const offerSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    offerType: { type: String, enum: ['product', 'category'], required: true },
    discountType: { type: String, enum: ['flat', 'percentage'], required: true },
    discountValue: { type: Number, required: true, min: 1 },
    maximumDiscountAmount: { type: Number, min: 1, default: null },
    // Polymorphic ref — stores Product._id or Category._id depending on offerType
    applicableTo: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'offerTypeModel' },
    startDate: { type: Date, default: Date.now },
    expiryDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

// Virtual for resolved model name used by refPath
offerSchema.virtual('offerTypeModel').get(function () {
    return this.offerType === 'product' ? 'Product' : 'Category';
});

offerSchema.index({ offerType: 1, applicableTo: 1, isActive: 1 });
offerSchema.index({ expiryDate: 1 });

export default mongoose.model('Offer', offerSchema);
