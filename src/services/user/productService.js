import Product from "../../model/productModel.js";
import Category from "../../model/categoryModel.js";
import Subcategory from "../../model/subcategoryModel.js";
import * as offerHelper from "../../utils/offerHelper.js";

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

  const subIdArr = (Array.isArray(subId) ? subId : [subId]).filter(id => id && id.trim() !== "");
  if (subIdArr.length > 0) {
    filter.subcategory = { $in: subIdArr };
    delete filter.$or;
  }

  const sizeArr = (Array.isArray(size) ? size : [size]).filter(s => s && s.trim() !== "");
  if (sizeArr.length > 0) filter["variants.size"] = { $in: sizeArr };

  let filterMinPrice = null;
  let filterMaxPrice = null;
  if (minPrice || maxPrice) {
    const getVal = (v) => Array.isArray(v) ? v[0] : v;
    const min = getVal(minPrice);
    const max = getVal(maxPrice);
    if (min && !isNaN(min)) filterMinPrice = Number(min);
    if (max && !isNaN(max)) filterMaxPrice = Number(max);
  }

  const trimmedSearch = search.trim();
  if (trimmedSearch) {
    const regex = new RegExp(trimmedSearch, "i");
    filter.$and = [{ $or: [{ name: regex }, { brand: regex }] }];
  }

  /* ── 5. Fetch All Matching & Apply Offers ── */
  const docs = await Product.find(filter)
    .populate("category", "name")
    .populate("subcategory", "name");

  let products = docs.map(d => d.toObject());
  products = await offerHelper.applyOffersToProducts(products);

  /* ── 6. Memory Filter by Final Price ── */
  if (filterMinPrice !== null || filterMaxPrice !== null) {
      products = products.filter(p => {
          const price = p.bestOffer ? p.bestOffer.finalPrice : p.minPrice;
          if (filterMinPrice !== null && price < filterMinPrice) return false;
          if (filterMaxPrice !== null && price > filterMaxPrice) return false;
          return true;
      });
  }

  /* ── 7. Memory Sort ── */
  products.sort((a, b) => {
      if (sort === "price_asc" || sort === "price_desc") {
          const priceA = a.bestOffer ? a.bestOffer.finalPrice : a.minPrice;
          const priceB = b.bestOffer ? b.bestOffer.finalPrice : b.minPrice;
          return sort === "price_asc" ? priceA - priceB : priceB - priceA;
      } else if (sort === "name_asc" || sort === "name_desc") {
          const nameA = a.name.toLowerCase();
          const nameB = b.name.toLowerCase();
          if (nameA < nameB) return sort === "name_asc" ? -1 : 1;
          if (nameA > nameB) return sort === "name_asc" ? 1 : -1;
          return 0;
      } else {
          // newest
          const dateA = new Date(a.createdAt).getTime();
          const dateB = new Date(b.createdAt).getTime();
          return dateB - dateA;
      }
  });

  /* ── 8. Pagination ── */
  const currentPage = Math.max(1, parseInt(page) || 1);
  const totalProducts = products.length;
  const totalPages = Math.ceil(totalProducts / PER_PAGE) || 1;
  const safePage = Math.min(currentPage, totalPages);
  
  const startIdx = (safePage - 1) * PER_PAGE;
  products = products.slice(startIdx, startIdx + PER_PAGE);

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
  const doc = await Product.findOne({ _id: id, isDeleted: false, isActive: true })
    .populate('category', 'name')
    .populate('subcategory', 'name');
  return doc ? doc.toObject() : null;
};

/**
 * Fetch related products from the same category
 */
export const getRelatedProducts = async (categoryId, excludeId, limit = 4) => {
  const docs = await Product.find({
    category: categoryId,
    _id: { $ne: excludeId },
    isActive: true,
    isDeleted: false
  })
    .populate('category', 'name')
    .limit(limit);
  return docs.map(d => d.toObject());
};

export const getHomeData = async () => {
    const categories = await Category.find({ isActive: true }).lean();
    
    // Latest Products (limit 12)
    const docs = await Product.find({
      isActive: true,
      isDeleted: false
    })
    .populate('category', 'name')
    .sort({ createdAt: -1 })
    .limit(12);

    const latestProducts = docs.map(d => d.toObject());

    return { categories, latestProducts };
};
