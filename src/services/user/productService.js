import Product from "../../model/productModel.js";
import Category from "../../model/categoryModel.js";
import Subcategory from "../../model/subcategoryModel.js";

/**
 * Fetch products for the main shop with filtering, sorting, and pagination
 * All logic for visibility (active categories/subs) is centralized here.
 * @param {Object} query - req.query from the controller
 * @returns {Promise<Object>} - products, total stats, and filters
 */
export const getStorefrontProducts = async (queryParams) => {
  const {
    category: categoryName,
    sub: subId,
    size,
    minPrice,
    maxPrice,
    sort = "newest",
    page = "1",
    search = "",
  } = queryParams;

  const PER_PAGE = 6;

  /* ── 1. Resolve category ── */
  let currentCategory = null;
  if (categoryName) {
    currentCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${categoryName.trim()}$`, "i") },
      isActive: true,
    }).lean();
  }

  /* ── 2. Collect visibility constraints ── */
  const activeSubIds = await Subcategory.find({ isActive: true }).distinct("_id");
  const activeCatIds = await Category.find({ isActive: true }).distinct("_id");

  /* ── 3. Build sidebar subcategories ── */
  let sidebarSubcategories = [];
  if (currentCategory) {
    sidebarSubcategories = await Subcategory.find({
      parentCategory: currentCategory._id,
      isActive: true,
    }).select("name").lean();
  }

  /* ── 4. Build product filter ── */
  const filter = {
    isActive: true,
    isDeleted: false,
    category: { $in: activeCatIds },
    $or: [
      { subcategory: { $exists: false } },
      { subcategory: null },
      { subcategory: { $in: activeSubIds } },
    ],
  };

  if (currentCategory) filter.category = currentCategory._id;

  const subIdArr = subId ? (Array.isArray(subId) ? subId : [subId]) : [];
  if (subIdArr.length > 0) {
    filter.subcategory = { $in: subIdArr };
    delete filter.$or;
  }

  const sizeArr = size ? (Array.isArray(size) ? size : [size]) : [];
  if (sizeArr.length > 0) filter["variants.size"] = { $in: sizeArr };

  if (minPrice || maxPrice) {
    const priceFilter = {};
    const getVal = (v) => Array.isArray(v) ? v[0] : v;
    const min = getVal(minPrice);
    const max = getVal(maxPrice);
    if (min && !isNaN(min)) priceFilter.$gte = Number(min);
    if (max && !isNaN(max)) priceFilter.$lte = Number(max);
    if (Object.keys(priceFilter).length > 0) filter["variants.price"] = priceFilter;
  }

  const trimmedSearch = search.trim();
  if (trimmedSearch) {
    const regex = new RegExp(trimmedSearch, "i");
    filter.$and = [{ $or: [{ name: regex }, { brand: regex }, { description: regex }] }];
  }

  /* ── 5. Sort ── */
  let sortQuery = { createdAt: -1 };
  switch (sort) {
    case "price_asc": sortQuery = { "variants.price": 1 }; break;
    case "price_desc": sortQuery = { "variants.price": -1 }; break;
    case "name_asc": sortQuery = { name: 1 }; break;
    case "name_desc": sortQuery = { name: -1 }; break;
  }

  /* ── 6. Pagination & Fetch ── */
  const currentPage = Math.max(1, parseInt(page) || 1);
  const totalProducts = await Product.countDocuments(filter);
  const totalPages = Math.ceil(totalProducts / PER_PAGE) || 1;
  const safePage = Math.min(currentPage, totalPages);

  const products = await Product.find(filter)
    .sort(sortQuery)
    .skip((safePage - 1) * PER_PAGE)
    .limit(PER_PAGE)
    .populate("category", "name")
    .populate("subcategory", "name")
    .lean();

  return {
    products,
    totalProducts,
    totalPages,
    currentPage: safePage,
    currentCategory,
    sidebarSubcategories,
    filterData: {
      selectedSizes: sizeArr,
      selectedSubIds: subIdArr,
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",
      sortBy: sort,
      searchQuery: trimmedSearch
    }
  };
};

/**
 * Fetch a single product by ID
 */
export const getProductById = async (id) => {
  return await Product.findOne({ _id: id, isDeleted: false, isActive: true })
    .populate('category', 'name')
    .populate('subcategory', 'name')
    .lean();
};

/**
 * Fetch related products from the same category
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
