import * as userProductService from "../../services/user/productService.js";
import Product from "../../model/productModel.js";
import Category from "../../model/categoryModel.js";
import Subcategory from "../../model/subcategoryModel.js";
import Wishlist from "../../model/wishlistModel.js";

const PER_PAGE = 9;

export const loadProducts = async (req, res) => {
  try {
    const {
      category: categoryName,
      sub: subId,
      size,
      minPrice,
      maxPrice,
      sort = "newest",
      page = "1",
      search = "",
    } = req.query;

    const PER_PAGE = 6;

    /* ── 1. Resolve category (must be active) ── */
    let currentCategory = null;
    if (categoryName) {
      currentCategory = await Category.findOne({
        name: { $regex: new RegExp(`^${categoryName.trim()}$`, "i") },
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
        isActive: true,
      }).select("name").lean();
    }

    /* ── 4. Collect active category IDs (products must belong to an active category) ── */
    const activeCatIds = await Category.find({ isActive: true }).distinct("_id");

    /* ── 5. Build product filter ── */
    const filter = {
      isActive: true,
      isDeleted: false,
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

    // Subcategory filter (handle both single and multiple subcategories)
    const subIdArr = subId
      ? (Array.isArray(subId) ? subId : [subId]).filter(id => typeof id === 'string' && id.trim() !== "")
      : [];

    if (subIdArr.length > 0) {
      filter.subcategory = { $in: subIdArr };
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
      const getVal = (v) => Array.isArray(v) ? v[0] : v;
      const min = getVal(minPrice);
      const max = getVal(maxPrice);

      if (min !== undefined && min !== "" && !isNaN(Number(min))) {
        priceFilter.$gte = Number(min);
      }
      if (max !== undefined && max !== "" && !isNaN(Number(max))) {
        priceFilter.$lte = Number(max);
      }

      if (Object.keys(priceFilter).length > 0) {
        filter["variants.price"] = priceFilter;
      }
    }

    // Search filter — name, brand, description
    const trimmedSearch = search.trim();
    if (trimmedSearch) {
      const regex = new RegExp(trimmedSearch, "i");
      filter.$and = [
        {
          $or: [
            { name: { $regex: regex } },
            { brand: { $regex: regex } },
            { description: { $regex: regex } },
          ],
        },
      ];
    }

    /* ── 6. Sort ── */
    let sortQuery = {};
    switch (sort) {
      case "price_asc": sortQuery = { "variants.price": 1 }; break;
      case "price_desc": sortQuery = { "variants.price": -1 }; break;
      case "name_asc": sortQuery = { name: 1 }; break;
      case "name_desc": sortQuery = { name: -1 }; break;
      default: sortQuery = { createdAt: -1 }; break; // newest
    }

    /* ── 7. Pagination ── */
    const currentPage = Math.max(1, parseInt(page) || 1);
    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / PER_PAGE) || 1;
    const safePage = Math.min(currentPage, totalPages);

    /* ── 8. Query products ── */
    const products = await Product.find(filter)
      .sort(sortQuery)
      .skip((safePage - 1) * PER_PAGE)
      .limit(PER_PAGE)
      .populate("category", "name")
      .populate("subcategory", "name")
      .lean();

    /* ── 9. Response Handling ── */
    const startItem = totalProducts === 0 ? 0 : (safePage - 1) * PER_PAGE + 1;
    const endItem = Math.min(safePage * PER_PAGE, totalProducts);

    /* ── 9. Wishlist status (if logged in) ── */
    let wishlistProductIds = [];
    if (req.session.user) {
      const wl = await Wishlist.findOne({ user: req.session.user._id }).lean();
      if (wl) wishlistProductIds = wl.products.map(id => id.toString());
    }

    const data = {
      title: currentCategory ? `${currentCategory.name} — SmartPick` : "Products — SmartPick",
      currentCategory,
      subcategories,
      products,
      totalProducts,
      currentPage: safePage,
      totalPages,
      selectedSizes: sizeArr,
      selectedSubIds: subIdArr,
      minPrice: minPrice || "",
      maxPrice: maxPrice || "",
      sortBy: sort,
      searchQuery: trimmedSearch,
      pages: totalPages,
      activePage: safePage,
      startItem,
      endItem,
      wishlistProductIds
    };

    // If it's an AJAX request (like for filters/pagination), return specific HTML fragments
    if (req.query.ajax === "true") {
      try {
        // We use res.app.render to render EJS partials to strings manually
        // We must pass res.locals to ensure global variables (like activePath) are available
        const gridHtml = await new Promise((resolve, reject) => {
          res.app.render("user/partials/productsGrid", { ...res.locals, products, wishlistProductIds }, (err, html) => err ? reject(err) : resolve(html));
        });
        const paginationHtml = await new Promise((resolve, reject) => {
          res.app.render("user/partials/pagination", { ...res.locals, pages: totalPages, activePage: safePage }, (err, html) => err ? reject(err) : resolve(html));
        });

        return res.json({
          success: true,
          gridHtml,
          paginationHtml,
          totalProducts,
          startItem,
          endItem
        });
      } catch (renderError) {
        console.error("AJAX Partial Render Error:", renderError);
        return res.status(500).json({ success: false, message: "Error updating content" });
      }
    }

    // Normal full-page render
    res.render("user/products/index", data);

  } catch (err) {
    console.error("loadProducts error:", err);
    res.status(500).send("Something went wrong while loading products.");
  }
};

export const loadProductDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await userProductService.getProductById(id);

    if (!product) {
      return res.status(404).render('user/404', { title: 'Product Not Found' });
    }

    // Fetch Related Products (same category, excluding current)
    const relatedProducts = await userProductService.getRelatedProducts(
      product.category._id,
      product._id,
      4
    );

    // Wishlist status
    let isInWishlist = false;
    if (req.session.user) {
      const wl = await Wishlist.findOne({ user: req.session.user._id, products: product._id }).lean();
      isInWishlist = !!wl;
    }

    res.render('user/products/details', {
      title: `${product.name} — SmartPick`,
      product,
      relatedProducts,
      isInWishlist
    });
  } catch (err) {
    console.error("Product details error:", err);
    if (err.name === 'CastError') {
      return res.status(404).render('user/404', { title: 'Product Not Found' });
    }
    res.status(500).send("Server Error");
  }
};
