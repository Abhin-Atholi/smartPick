import * as userProductService from "../../services/user/productService.js";
import * as wishlistService from "../../services/user/wishlistService.js";

const PER_PAGE = 9;

export const loadProducts = async (req, res) => {
  try {
    const data = await userProductService.getStorefrontProducts(req.query);

    /* ── Wishlist status (if logged in) ── */
    let wishlistProductIds = [];
    if (req.session.user) {
      wishlistProductIds = await wishlistService.getWishlistProductIds(req.session.user._id);
    }

    const { 
      products, totalProducts, totalPages, currentPage, 
      currentCategory, sidebarSubcategories, filterData 
    } = data;

    const startItem = totalProducts === 0 ? 0 : (currentPage - 1) * 6 + 1;
    const endItem = Math.min(currentPage * 6, totalProducts);

    const renderData = {
      title: currentCategory ? `${currentCategory.name} — SmartPick` : "Products — SmartPick",
      currentCategory,
      subcategories: sidebarSubcategories,
      products,
      totalProducts,
      currentPage,
      totalPages,
      selectedSizes: filterData.selectedSizes,
      selectedSubIds: filterData.selectedSubIds,
      minPrice: filterData.minPrice,
      maxPrice: filterData.maxPrice,
      sortBy: filterData.sortBy,
      searchQuery: filterData.searchQuery,
      pages: totalPages,
      activePage: currentPage,
      startItem,
      endItem,
      wishlistProductIds
    };

    // If it's an AJAX request (like for filters/pagination), return specific HTML fragments
    if (req.query.ajax === "true") {
      try {
        const gridHtml = await new Promise((resolve, reject) => {
          res.app.render("user/partials/productsGrid", { ...res.locals, products, wishlistProductIds }, (err, html) => err ? reject(err) : resolve(html));
        });
        const paginationHtml = await new Promise((resolve, reject) => {
          res.app.render("user/partials/pagination", { ...res.locals, pages: totalPages, activePage: currentPage }, (err, html) => err ? reject(err) : resolve(html));
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
    res.render("user/products/index", renderData);

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
      return res.redirect("/?msg=The item is currently unavailable")
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
      isInWishlist = await wishlistService.isInWishlist(req.session.user._id, product._id);
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
