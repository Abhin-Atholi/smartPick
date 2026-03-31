import mongoose from "mongoose";

const variantSchema = new mongoose.Schema({
  size: {
    type: String,
    required: true,
    trim: true,
  },
  color: {
    type: String,
    required: true,
    trim: true,
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
    unique: true,
    trim: true,
  }
}, { _id: false });

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    index: true,
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
  }

}, { timestamps: true });

export default mongoose.model("Product", productSchema);
