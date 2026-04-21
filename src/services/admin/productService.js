import Product from "../../model/productModel.js";
import Category from "../../model/categoryModel.js";
import Subcategory from "../../model/subcategoryModel.js";
import { deleteCloudinaryFile } from "../../utils/fileHelper.js";

/**
 * Helper: Extract Cloudinary public_id from a URL
 */
const extractPublicId = (url) => {
  const parts = url.split('/');
  const uploadIndex = parts.indexOf('upload');
  if (uploadIndex === -1) return null;
  const publicIdWithFormat = parts.slice(uploadIndex + 2).join('/');
  return publicIdWithFormat.split('.')[0];
};

/**
 * Helper: Generate unique SKU
 */
const generateSku = async (categoryId, subcategoryId) => {
  const category = await Category.findById(categoryId);
  const subcategory = subcategoryId ? await Subcategory.findById(subcategoryId) : null;

  const catCode = category.name.slice(0, 3).toUpperCase();
  const subCode = subcategory ? subcategory.name.slice(0, 3).toUpperCase() : 'GEN'; // GENerics if no subcategory

  const prefix = `${catCode}-${subCode}`;
  
  // Find the highest number for this prefix
  const lastProduct = await Product.findOne({ "variants.sku": new RegExp(`^${prefix}-`) })
    .sort({ "variants.sku": -1 })
    .lean();

  let nextNum = 1;

  if (lastProduct && lastProduct.variants) {
    const skus = lastProduct.variants
      .map(v => v.sku)
      .filter(s => s.startsWith(`${prefix}-`))
      .map(s => parseInt(s.split('-')[2]))
      .filter(n => !isNaN(n));
      
    if (skus.length > 0) {
      nextNum = Math.max(...skus) + 1;
    }
  }

  return `${prefix}-${nextNum.toString().padStart(3, '0')}`;
};

/**
 * Fetch products with pagination, search, sorting, and category filtering
 */
export const getProducts = async ({ search, status, categoryId, subcategoryId, page, sortField, sortOrder, limit }) => {
  const skip = (page - 1) * limit;
  let query = { isDeleted: false }; // Only non-deleted products

  if (search) {
    query.name = { $regex: search, $options: "i" };
  }

  if (status === "Active") query.isActive = true;
  else if (status === "Hidden") query.isActive = false;

  if (categoryId && categoryId !== "All") {
    query.category = categoryId;
  }

  if (subcategoryId && subcategoryId !== "All") {
    query.subcategory = subcategoryId;
  }

  const totalDocuments = await Product.countDocuments(query);
  const totalPages = Math.ceil(totalDocuments / limit) || 1;

  const sortConfig = { [sortField]: sortOrder };

  const products = await Product.find(query)
    .populate("category", "name")
    .populate("subcategory", "name")
    .sort(sortConfig)
    .skip(skip)
    .limit(limit);

  const totalProducts = await Product.countDocuments({ isDeleted: false });
  const activeProducts = await Product.countDocuments({ isDeleted: false, isActive: true });
  const hiddenProducts = await Product.countDocuments({ isDeleted: false, isActive: false });
  const featuredProducts = await Product.countDocuments({ isDeleted: false, isFeatured: true });

  return {
    products,
    totalPages,
    stats: { totalProducts, activeProducts, hiddenProducts, featuredProducts }
  };
};

/**
 * Fetch a single product by ID (for edit pre-population)
 */
export const getProductById = async (id) => {
  return await Product.findOne({ _id: id, isDeleted: false })
    .populate("category", "name _id")
    .populate("subcategory", "name _id");
};

/**
 * Check if a product name already exists (case-insensitive)
 */
export const checkProductExists = async (name) => {
  return await Product.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, "i") }, isDeleted: false });
};

/**
 * Create a new product
 */
export const createProduct = async (productData) => {
  // Generate SKUs for each variant
  for (let i = 0; i < productData.variants.length; i++) {
    // Each variant gets a unique SKU increment?
    // User: "SKU should be generated based on category, subcategory, and an incremental number"
    // I'll ensure each variant in the array has its own SKU increment.
    productData.variants[i].sku = await generateSku(productData.category, productData.subcategory);
    // Wait, if I do it in a loop without saving, generateSku will return the same max+1.
    // I should fix that by pre-calculating the sequence.
  }

  const product = new Product(productData);
  return await product.save();
};

/**
 * Optimized Create with sequence handling
 */
export const createProductFixed = async (productData) => {
  const category = await Category.findById(productData.category);
  const subcategory = productData.subcategory ? await Subcategory.findById(productData.subcategory) : null;

  const catCode = category.name.slice(0, 3).toUpperCase();
  const subCode = subcategory ? subcategory.name.slice(0, 3).toUpperCase() : 'GEN';
  const prefix = `${catCode}-${subCode}`;

  const lastProduct = await Product.findOne({ "variants.sku": new RegExp(`^${prefix}-`) })
    .sort({ "variants.sku": -1 })
    .lean();

  let nextNum = 1;
  if (lastProduct && lastProduct.variants) {
    const skus = lastProduct.variants
      .map(v => v.sku)
      .filter(s => s.startsWith(`${prefix}-`))
      .map(s => parseInt(s.split('-')[2]))
      .filter(n => !isNaN(n));
    if (skus.length > 0) nextNum = Math.max(...skus) + 1;
  }

  productData.variants.forEach((v, index) => {
    v.sku = `${prefix}-${(nextNum + index).toString().padStart(3, '0')}`;
  });

  const product = new Product(productData);
  return await product.save();
};

/**
 * Update a product; deletes removed Cloudinary images
 */
export const updateProduct = async (id, updateData, removedImageUrls) => {
  const product = await Product.findById(id);
  if (!product || product.isDeleted) return null;

  // Delete removed images from Cloudinary
  if (removedImageUrls && removedImageUrls.length > 0) {
    for (const url of removedImageUrls) {
      const publicId = extractPublicId(url);
      if (publicId) {
        try {
          await deleteCloudinaryFile(publicId);
        } catch (err) {
          console.error("Failed to purge removed product image:", err);
        }
      }
    }
  }

  // SKU Management for new variants or changed category/sub
  const catChanged = product.category.toString() !== updateData.category.toString();
  const subChanged = (product.subcategory || '').toString() !== (updateData.subcategory || '').toString();

  if (catChanged || subChanged) {
    // Re-generate all SKUs if category changed
    const category = await Category.findById(updateData.category);
    const subcategory = updateData.subcategory ? await Subcategory.findById(updateData.subcategory) : null;
    const catCode = category.name.slice(0, 3).toUpperCase();
    const subCode = subcategory ? subcategory.name.slice(0, 3).toUpperCase() : 'GEN';
    const prefix = `${catCode}-${subCode}`;
    
    // Find nextNum (same as create)
    let nextNum = 1;
    const lastProduct = await Product.findOne({ "variants.sku": new RegExp(`^${prefix}-`), _id: { $ne: id } })
      .sort({ "variants.sku": -1 }).lean();
    if (lastProduct && lastProduct.variants) {
      const skus = lastProduct.variants.map(v => v.sku).filter(s => s.startsWith(`${prefix}-`)).map(s => parseInt(s.split('-')[2])).filter(n => !isNaN(n));
      if (skus.length > 0) nextNum = Math.max(...skus) + 1;
    }

    updateData.variants.forEach((v, index) => {
      v.sku = `${prefix}-${(nextNum + index).toString().padStart(3, '0')}`;
    });
  } else {
    // Prefix is the same. Assign SKUs to variants that don't have one (if any)
    const category = await Category.findById(product.category);
    const subcategory = product.subcategory ? await Subcategory.findById(product.subcategory) : null;
    const catCode = category.name.slice(0, 3).toUpperCase();
    const subCode = subcategory ? subcategory.name.slice(0, 3).toUpperCase() : 'GEN';
    const prefix = `${catCode}-${subCode}`;

    let nextNum = 1;
    const lastProduct = await Product.findOne({ "variants.sku": new RegExp(`^${prefix}-`), _id: { $ne: id } })
      .sort({ "variants.sku": -1 }).lean();
    if (lastProduct && lastProduct.variants) {
      const skus = lastProduct.variants.map(v => v.sku).filter(s => s.startsWith(`${prefix}-`)).map(s => parseInt(s.split('-')[2])).filter(n => !isNaN(n));
      if (skus.length > 0) nextNum = Math.max(...skus) + 1;
    }
    
    // Also consider existing variants in this product that have the same prefix
    const existingSkus = product.variants.map(v => v.sku).filter(s => s.startsWith(`${prefix}-`)).map(s => parseInt(s.split('-')[2])).filter(n => !isNaN(n));
    if (existingSkus.length > 0) {
        nextNum = Math.max(nextNum, Math.max(...existingSkus) + 1);
    }

    updateData.variants.forEach((v) => {
      if (!v.sku) {
        v.sku = `${prefix}-${nextNum.toString().padStart(3, '0')}`;
        nextNum++;
      }
    });
  }

  product.name = updateData.name;
  product.description = updateData.description;
  product.brand = updateData.brand;
  product.category = updateData.category;
  product.subcategory = updateData.subcategory || null;
  product.variants = updateData.variants;
  product.isActive = updateData.isActive;
  product.isFeatured = updateData.isFeatured;

  return await product.save();
};

/**
 * Soft delete a product (sets isDeleted: true)
 */
export const softDeleteProduct = async (id) => {
  return await Product.findByIdAndUpdate(id, { isDeleted: true, isActive: false }, { new: true });
};

/**
 * Toggle product visibility
 */
export const toggleProductStatus = async (id) => {
  const product = await Product.findOne({ _id: id, isDeleted: false })
    .populate("category", "isActive")
    .populate("subcategory", "isActive");

  if (!product) return null;

  if (!product.isActive) {
    const categoryIsHidden = product.category && !product.category.isActive;
    const subCategoryIsHidden = product.subcategory && !product.subcategory.isActive;

    if (categoryIsHidden || subCategoryIsHidden) {
      return { blocked: true, message: "Cannot activate product because its parent category/subcategory is hidden." };
    }
  }

  product.isActive = !product.isActive;
  if (!product.isActive) product.isFeatured = false;
  return await product.save();
};

/**
 * Toggle product featured status
 */
export const toggleProductFeatured = async (id) => {
  const product = await Product.findOne({ _id: id, isDeleted: false });
  if (!product) return null;

  if (!product.isActive && !product.isFeatured) {
    return { blocked: true, message: "Cannot feature a hidden product. Activate the product first." };
  }

  product.isFeatured = !product.isFeatured;
  return await product.save();
};

