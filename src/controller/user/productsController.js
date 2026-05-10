import * as userProductService from "../../services/user/productService.js";
import * as wishlistService from "../../services/user/wishlistService.js";
import Offer from "../../model/offerModel.js";
import Coupon from "../../model/couponModel.js";
import * as cartService from "../../services/user/cartService.js";
import * as offerHelper from "../../utils/offerHelper.js";

const PER_PAGE = 9;

export const loadProducts = async (req, res) => {
  try {
    const data = await userProductService.getStorefrontProducts(req.query);

    /* ── Wishlist status (if logged in) ── */
    let wishlistProductIds = [];
    if (req.session.user) {
      wishlistProductIds = await wishlistService.getWishlistProductIds(req.session.user._id);
    }

    let { 
      products, totalProducts, totalPages, currentPage, 
      currentCategory, sidebarSubcategories, filterData 
    } = data;

    // Enrich products with best offer info
    products = await offerHelper.applyOffersToProducts(products);

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
      3
    );

    // Enrich related products with offers
    const enrichedRelated = await offerHelper.applyOffersToProducts(relatedProducts);

    // Wishlist status
    let isInWishlist = false;
    if (req.session.user) {
      isInWishlist = await wishlistService.isInWishlist(req.session.user._id, product._id);
    }

    // Fetch best offer for initial display (using min price variant)
    const minPrice = Math.min(...product.variants.map(v => v.price));
    const bestOffer = await offerHelper.getBestOffer(product._id, product.category._id, minPrice);

    res.render('user/products/details', {
      title: `${product.name} — SmartPick`,
      product,
      relatedProducts: enrichedRelated,
      isInWishlist,
      bestOffer
    });
  } catch (err) {
    console.error("Product details error:", err);
    if (err.name === 'CastError') {
      return res.status(404).render('user/404', { title: 'Product Not Found' });
    }
    res.status(500).send("Server Error");
  }
};

/**
 * Fetch all eligible offers for a product
 */
export const getProductOffers = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await userProductService.getProductById(id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const categoryId = product.category?._id || product.category;
    const now = new Date();

    const offers = await Offer.find({
      isActive: true,
      isDeleted: false,
      startDate: { $lte: now },
      expiryDate: { $gt: now },
      $or: [
        { offerType: 'product', applicableTo: id },
        { offerType: 'category', applicableTo: categoryId }
      ]
    }).lean();

    // Base price for calculations (using min price of variants)
    const basePrice = Math.min(...product.variants.map(v => v.price));

    let bestDiscountAmount = 0;
    let bestOfferId = null;

    const processedOffers = offers.map(offer => {
      let discount = 0;
      if (offer.discountType === 'flat') {
        discount = offer.discountValue;
      } else {
        discount = (basePrice * offer.discountValue) / 100;
      }

      // Cap discount
      discount = Math.min(discount, basePrice - 1);

      if (discount > bestDiscountAmount) {
        bestDiscountAmount = discount;
        bestOfferId = offer._id;
      }

      return {
        ...offer,
        discountAmount: parseFloat(discount.toFixed(2))
      };
    });

    return res.json({ 
      success: true, 
      offers: processedOffers, 
      bestOfferId,
      basePrice 
    });
  } catch (err) {
    console.error("getProductOffers error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

/**
 * Fetch all eligible coupons for the product/cart context
 */
export const getEligibleCoupons = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.currentUser?._id || req.session?.user?._id;
    const product = await userProductService.getProductById(id);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const now = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      isDeleted: false,
      startDate: { $lte: now },
      expiryDate: { $gt: now },
      $expr: { $lt: ['$usedCount', '$usageLimit'] }
    }).lean();

    // Logic: If on product page, we consider the product's price as the baseline.
    // If the user has a cart, we should ideally use the cart total.
    let cartTotal = 0;
    if (userId) {
      const cartData = await cartService.getCart(userId, 1, 100);
      if (cartData && cartData.items.length > 0) {
        cartData.items.forEach(item => {
          // getCart already filters deleted/inactive mostly, but let's be safe
          cartTotal += item.effectiveTotalPrice;
        });
      }
    }

    // If cart is empty or user not logged in, use product price as "potential" total
    const productPrice = Math.min(...product.variants.map(v => v.price));
    const comparisonTotal = Math.max(cartTotal, productPrice);

    const processedCoupons = coupons.map(coupon => {
      const isEligible = comparisonTotal >= coupon.minimumAmount;
      const alreadyUsed = userId && coupon.usedBy && coupon.usedBy.some(id => id.toString() === userId.toString());
      
      return {
        ...coupon,
        isEligible,
        alreadyUsed,
        potentialDiscount: coupon.discountType === 'flat' 
          ? coupon.discountValue 
          : parseFloat(((comparisonTotal * coupon.discountValue) / 100).toFixed(2))
      };
    });

    return res.json({ 
      success: true, 
      coupons: processedCoupons,
      currentTotal: comparisonTotal,
      appliedCoupon: req.session.appliedCoupon || null
    });
  } catch (err) {
    console.error("getEligibleCoupons error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
