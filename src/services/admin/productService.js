import Product from "../../model/productModel.js";
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
 * Fetch products with pagination, search, sorting, and category filtering
 */
export const getProducts = async ({ search, status, categoryId, page, sortField, sortOrder, limit }) => {
    const skip = (page - 1) * limit;
    let query = {};

    if (search) {
        query.name = { $regex: search, $options: "i" };
    }

    if (status === "Active") query.isActive = true;
    else if (status === "Hidden") query.isActive = false;

    if (categoryId && categoryId !== "All") {
        query.category = categoryId;
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

    const totalProducts = await Product.countDocuments();
    const activeProducts = await Product.countDocuments({ isActive: true });
    const hiddenProducts = await Product.countDocuments({ isActive: false });
    const featuredProducts = await Product.countDocuments({ isFeatured: true });

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
    return await Product.findById(id)
        .populate("category", "name _id")
        .populate("subcategory", "name _id");
};

/**
 * Check if a product name already exists (case-insensitive)
 */
export const checkProductExists = async (name) => {
    return await Product.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, "i") } });
};

/**
 * Create a new product
 */
export const createProduct = async (productData) => {
    const product = new Product(productData);
    return await product.save();
};

/**
 * Update a product; deletes removed Cloudinary images
 */
export const updateProduct = async (id, updateData, newImageUrls, removedImageUrls) => {
    const product = await Product.findById(id);
    if (!product) return null;

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
        // Remove from existing images array
        product.images = product.images.filter(img => !removedImageUrls.includes(img));
    }

    // Append newly uploaded images
    if (newImageUrls && newImageUrls.length > 0) {
        product.images = [...product.images, ...newImageUrls];
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
 * Soft delete a product (sets isActive: false)
 */
export const softDeleteProduct = async (id) => {
    return await Product.findByIdAndUpdate(id, { isActive: false }, { new: true });
};

/**
 * Toggle product visibility
 */
export const toggleProductStatus = async (id) => {
    const product = await Product.findById(id);
    if (!product) return null;
    product.isActive = !product.isActive;
    return await product.save();
};

/**
 * Toggle product featured status
 */
export const toggleProductFeatured = async (id) => {
    const product = await Product.findById(id);
    if (!product) return null;
    product.isFeatured = !product.isFeatured;
    return await product.save();
};
