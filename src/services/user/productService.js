import Product from "../../model/productModel.js";

/**
 * Fetch a single product by ID
 * @param {string} id 
 * @returns {Promise<Object>}
 */
export const getProductById = async (id) => {
  return await Product.findOne({ _id: id, isDeleted: false, isActive: true })
    .populate('category', 'name')
    .populate('subcategory', 'name')
    .lean();
};

/**
 * Fetch related products from the same category
 * @param {string} categoryId 
 * @param {string} excludeId 
 * @param {number} limit 
 * @returns {Promise<Array>}
 */
export const getRelatedProducts = async (categoryId, excludeId, limit = 4) => {
  return await Product.find({
      category: categoryId,
      _id: { $ne: excludeId },
      isActive: true,
      isDeleted: false
    })
    .populate('category', 'name')
    .limit(limit)
    .lean();
};
