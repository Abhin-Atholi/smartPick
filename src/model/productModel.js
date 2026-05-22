import mongoose from "mongoose";
import { PRODUCT_SIZES } from "../config/productConstants.js";

const colorOptionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
  images: {
    type: [String],
    validate: {
      validator: (arr) => arr.length >= 3,
      message: "Minimum 3 images required per color"
    }
  },
  isDefault: { type: Boolean, default: false }
});

const variantSchema = new mongoose.Schema({
  size: {
    type: String,
    required: true,
    enum: PRODUCT_SIZES,
    trim: true,
  },
  color: {
    type: String, // Just the color name to map to colorOptions
    required: true
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
});

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

  colorOptions: {
    type: [colorOptionSchema],
    validate: [
      {
        validator: (arr) => arr.length > 0,
        message: "At least one color option is required"
      },
      {
        validator: function(arr) {
          const names = arr.map(c => c.name.toLowerCase());
          return names.length === new Set(names).size;
        },
        message: "Duplicate color names are not allowed."
      }
    ]
  },

  variants: {
    type: [variantSchema],
    validate: [
      {
        validator: (arr) => arr.length > 0,
        message: "At least one product variant required"
      },
      {
        validator: function(arr) {
          const keys = arr.map(v => `${v.size}-${v.color.toLowerCase()}`);
          return keys.length === new Set(keys).size;
        },
        message: "Duplicate variants (same size and color) are not allowed."
      }
    ]
  },

  isActive: {
    type: Boolean,
    default: true,
  },

  minPrice: {
    type: Number,
    default: 0
  },

  isFeatured: {
    type: Boolean,
    default: false,
  },

  isDeleted: {
    type: Boolean,
    default: false,
  },

  averageRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },

  reviewCount: {
    type: Number,
    default: 0,
    min: 0
  }

}, { timestamps: true });

// Pre-save middleware to enforce exactly one default color and calculate minPrice
productSchema.pre('save', async function() {
    if (this.colorOptions && this.colorOptions.length > 0) {
        let defaultCount = this.colorOptions.filter(c => c.isDefault).length;
        
        // If no default color is set, or multiple are set, reset and make the first one default
        if (defaultCount !== 1) {
            this.colorOptions.forEach((c, index) => {
                c.isDefault = index === 0;
            });
        }
    }
    
    if (this.variants && this.variants.length > 0) {
        this.minPrice = Math.min(...this.variants.map(v => v.price));
    } else {
        this.minPrice = 0;
    }
});

// Static for building the standard "User-Visible" query
productSchema.statics.visibleOnly = function() {
    return this.find({ isActive: true, isDeleted: false });
};

// Indexing for performance
productSchema.index({ name: 1 });
productSchema.index({ category: 1 });
productSchema.index({ subcategory: 1 });
productSchema.index({ isDeleted: 1, isActive: 1 });
productSchema.index({ "variants.sku": 1 });
productSchema.index({ "variants.size": 1 });
productSchema.index({ minPrice: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ brand: 1 });
productSchema.index({ name: "text", brand: "text", description: "text" });

/**
 * VIRTUAL: Comprehensive Availability Check
 * Returns true only if the product AND its parent category/subcategory are active.
 * Requires category/subcategory to be populated.
 */
productSchema.virtual('isCurrentlyAvailable').get(function() {
    // 1. Basic product status
    if (!this.isActive || this.isDeleted) return false;
    
    // 2. Category status (if populated)
    if (this.category && typeof this.category === 'object' && 'isActive' in this.category) {
        if (!this.category.isActive) return false;
    }
    
    // 3. Subcategory status (if populated and exists)
    if (this.subcategory && typeof this.subcategory === 'object' && 'isActive' in this.subcategory) {
        if (!this.subcategory.isActive) return false;
    }
    
    return true;
});

/**
 * VIRTUAL: Total Stock
 * Sums up the stock of all variants.
 */
productSchema.virtual('totalStock').get(function() {
    if (!this.variants || this.variants.length === 0) return 0;
    return this.variants.reduce((total, variant) => total + (variant.stock || 0), 0);
});

/**
 * VIRTUAL: Default Color
 * Returns the color marked isDefault: true, or the first color.
 */
productSchema.virtual('defaultColor').get(function() {
    if (!this.colorOptions || this.colorOptions.length === 0) return null;
    const defaultColor = this.colorOptions.find(c => c.isDefault);
    return defaultColor || this.colorOptions[0];
});

/**
 * VIRTUAL: Default Image
 * Returns the first image of the default color, or a placeholder.
 */
productSchema.virtual('defaultImage').get(function() {
    const dColor = this.defaultColor;
    if (dColor && dColor.images && dColor.images.length > 0) {
        return dColor.images[0];
    }
    return '/images/placeholder.jpg';
});

/**
 * VIRTUAL: Default Variant
 * Returns the first variant that matches the default color.
 */
productSchema.virtual('defaultVariant').get(function() {
    if (!this.variants || this.variants.length === 0) return null;
    const dColor = this.defaultColor;
    if (!dColor) return this.variants[0];
    
    // Find first variant matching default color
    const defaultVariant = this.variants.find(v => v.color === dColor.name);
    return defaultVariant || this.variants[0];
});

// Ensure virtuals are included when converting to JSON/Object (crucial for EJS)
productSchema.set('toObject', { virtuals: true });
productSchema.set('toJSON', { virtuals: true });

export default mongoose.model("Product", productSchema);
