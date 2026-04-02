import mongoose from "mongoose";

const variantSchema = new mongoose.Schema({
  size: {
    type: String,
    required: true,
    enum: ["S", "M", "L", "XL"],
    trim: true,
  },
  color: {
    name: { type: String, required: true },
    code: { type: String, required: true }
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
  },
  sku: {
    type: String,
    required: true,
    trim: true,
  }
}, { _id: false });

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },

  description: {
    type: String,
    trim: true,
  },

  brand: {
    type: String,
    trim: true,
  },

  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: true,
  },

  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Subcategory",
  },

  images: {
    type: [String],
    validate: {
      validator: (arr) => arr.length >= 3,
      message: "Minimum 3 product images required"
    }
  },

  variants: {
    type: [variantSchema],
    validate: {
      validator: (arr) => arr.length > 0,
      message: "At least one product variant required"
    }
  },

  isActive: {
    type: Boolean,
    default: true,
  },

  isFeatured: {
    type: Boolean,
    default: false,
  },

  isDeleted: {
    type: Boolean,
    default: false,
  }

}, { timestamps: true });

// Indexing for performance
productSchema.index({ name: 1 });
productSchema.index({ category: 1 });
productSchema.index({ subcategory: 1 });
productSchema.index({ isDeleted: 1, isActive: 1 });
productSchema.index({ "variants.sku": 1 });
productSchema.index({ createdAt: -1 });

export default mongoose.model("Product", productSchema);
