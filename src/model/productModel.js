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
  },
  images: {
    type: [String],
    validate: {
      validator: (arr) => arr.length >= 3,
      message: "Minimum 3 images required per variant"
    }
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



  variants: {
    type: [variantSchema],
    validate: [
      {
        validator: (arr) => arr.length > 0,
        message: "At least one product variant required"
      },
      {
        validator: function(arr) {
          const keys = arr.map(v => `${v.size}-${v.color.name.toLowerCase()}`);
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

  isFeatured: {
    type: Boolean,
    default: false,
  },

  isDeleted: {
    type: Boolean,
    default: false,
  }

}, { timestamps: true });

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
productSchema.index({ createdAt: -1 });

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

// Ensure virtuals are included when converting to JSON/Object (crucial for EJS)
productSchema.set('toObject', { virtuals: true });
productSchema.set('toJSON', { virtuals: true });

export default mongoose.model("Product", productSchema);
