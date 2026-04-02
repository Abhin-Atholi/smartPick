import Product     from "../../model/productModel.js";
import Category    from "../../model/categoryModel.js";
import Subcategory from "../../model/subcategoryModel.js";

const PER_PAGE = 9;

export const loadProducts = async (req, res) => {
  try {
    const {
      category: categoryName,
      sub:      subId,
      size,
      minPrice,
      maxPrice,
      sort   = "newest",
      page   = "1",
      search = "",
    } = req.query;

    /* ── 1. Resolve category (must be active) ── */
    let currentCategory = null;
    if (categoryName) {
      currentCategory = await Category.findOne({
        name    : { $regex: new RegExp(`^${categoryName.trim()}$`, "i") },
        isActive: true,
      }).lean();
    }

    /* ── 2. Collect all active subcategory IDs (to exclude products of blocked subs) ── */
    const activeSubIds = await Subcategory.find({ isActive: true }).distinct("_id");

    /* ── 3. Fetch sidebar subcategories for this category ── */
    let subcategories = [];
    if (currentCategory) {
      subcategories = await Subcategory.find({
        parentCategory: currentCategory._id,
        isActive      : true,
      }).select("name").lean();
    }

    /* ── 4. Collect active category IDs (products must belong to an active category) ── */
    const activeCatIds = await Category.find({ isActive: true }).distinct("_id");

    /* ── 5. Build product filter ── */
    const filter = {
      isActive: true,
      category: { $in: activeCatIds },             // exclude products of blocked categories
      $or: [
        { subcategory: { $exists: false } },        // product has no subcategory ref
        { subcategory: null },
        { subcategory: { $in: activeSubIds } },     // OR belongs to an active subcategory
      ],
    };

    // If browsing a specific category, restrict to it
    if (currentCategory) {
      filter.category = currentCategory._id;        // overrides the $in above
    }

    // Subcategory filter
    if (subId) {
      filter.subcategory = subId;
      delete filter.$or;                            // $or no longer needed when sub is explicit
    }

    // Size filter — matches any variant with that size
    const sizeArr = size
      ? (Array.isArray(size) ? size : [size])
      : [];
    if (sizeArr.length > 0) {
      filter["variants.size"] = { $in: sizeArr };
    }

    // Price filter — matches by any variant within range
    if (minPrice || maxPrice) {
      const priceFilter = {};
      if (minPrice) priceFilter.$gte = Number(minPrice);
      if (maxPrice) priceFilter.$lte = Number(maxPrice);
      filter["variants.price"] = priceFilter;
    }

    // Search filter — name, brand, description
    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      const regex = new RegExp(trimmedSearch, "i");
      filter.$and = [
        {
          $or: [
            { name       : { $regex: regex } },
            { brand      : { $regex: regex } },
            { description: { $regex: regex } },
          ],
        },
      ];
    }

    /* ── 6. Sort ── */
    let sortQuery = {};
    switch (sort) {
      case "price_asc":  sortQuery = { "variants.0.price":  1 }; break;
      case "price_desc": sortQuery = { "variants.0.price": -1 }; break;
      case "name_asc":   sortQuery = { name:  1 };               break;
      case "name_desc":  sortQuery = { name: -1 };               break;
      default:           sortQuery = { createdAt: -1 };           break; // newest
    }

    /* ── 7. Pagination ── */
    const currentPage   = Math.max(1, parseInt(page) || 1);
    const totalProducts = await Product.countDocuments(filter);
    const totalPages    = Math.ceil(totalProducts / PER_PAGE) || 1;
    const safePage      = Math.min(currentPage, totalPages);

    /* ── 8. Query products ── */
    const products = await Product.find(filter)
      .sort(sortQuery)
      .skip((safePage - 1) * PER_PAGE)
      .limit(PER_PAGE)
      .populate("category",    "name")
      .populate("subcategory", "name")
      .lean();

    res.render("user/products/index", {
      title          : currentCategory
        ? `${currentCategory.name} — SmartPick`
        : "Products — SmartPick",
      currentCategory,
      subcategories,
      products,
      totalProducts,
      currentPage    : safePage,
      totalPages,
      selectedSizes  : sizeArr,
      selectedSubId  : subId || "",
      minPrice       : minPrice || "",
      maxPrice       : maxPrice || "",
      sortBy         : sort,
      searchQuery    : trimmedSearch,
    });

  } catch (err) {
    console.error("loadProducts error:", err);
    res.status(500).send("Something went wrong while loading products.");
  }
};
