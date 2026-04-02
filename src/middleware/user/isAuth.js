import User from "../../model/userModel.js";
import Wishlist from "../../model/wishlistModel.js";
import Cart from "../../model/cartModel.js";

export const setAuthLocals = (req, res, next) => {
    // 🛠️ FIX 1: If the user has an old admin session in req.session.user, clean it up!
    if (req.session?.user?.role === 'admin') {
        req.session.adminId = req.session.user._id;
        req.session.admin = req.session.user;
        delete req.session.user;
    }

    // 🛠️ FIX 2: Restore Passport.js support (req.user)
    const currentUser = req.user || req.session?.user || null;
    
    // Attach to req as well for consistent controller access
    req.currentUser = currentUser;

    res.locals.user = currentUser;
    res.locals.admin = req.session?.admin || null;
    
    // UI mostly uses isAuth for users
    res.locals.isAuth = !!currentUser;
    res.locals.isAdminAuth = !!req.session?.admin;
    
    next();
};

export const redirectIfAuth = (req, res, next) => {
    const currentUser = req.user || req.session?.user || null;
    
    // If a user is logged in as a USER, don't let them see login/register
    if (currentUser) {
        return res.redirect("/home");
    }
    next();
};

// If a user is already verified, don't let them stay on the OTP page
export const redirectIfVerified = async (req, res, next) => {
  try {
    const email = req.query?.email || req.body?.email;
    if (!email) return next();

    const user = await User.findOne({ email }).select("isVerified");
    if (user?.isVerified) {
      const currentUser = req.user || req.session?.user || null;
      return currentUser
        ? res.redirect("/home")
        : res.redirect("/login");
    }
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware to check if a logged-in user has been blocked.
 */
export const protectRoute = (req, res, next) => {
  const currentUser = req.user || req.session?.user || null;
  if (!currentUser) {
      if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
          return res.status(401).json({ success: false, message: "Please login first" });
      }
      return res.redirect("/login");
  }
  next();
};

export const checkBlocked = async (req, res, next) => {
  try {
    const currentUser = req.user || req.session?.user || null;
    if (!currentUser?._id) return next();

    const user = await User.findById(currentUser._id).select("status");

    if (!user || user.status === "blocked") {
        delete req.session.userId;
        delete req.session.user;
        delete req.session.passport;
        req.user = null;

        return req.session.save((err) => {
          if (err) console.error("Session save error:", err);
          return res.redirect("/login?msg=Your account has been blocked.");
        });
    }
    next();
  } catch (error) {
    console.error("Error in checkBlocked middleware:", error);
    next();
  }
};

/**
 * Middleware to fetch and set wishlist/cart data for the UI
 */
export const setCartAndWishlistLocals = async (req, res, next) => {
    try {
        const currentUser = req.user || req.session?.user || null;
        
        if (currentUser) {
            const [wishlist, cart] = await Promise.all([
                Wishlist.findOne({ user: currentUser._id }).select("products"),
                Cart.findOne({ user: currentUser._id }).select("items")
            ]);

            res.locals.wishlistProductIds = wishlist ? wishlist.products.map(p => p.toString()) : [];
            res.locals.cart = cart || { items: [] };
        } else {
            res.locals.wishlistProductIds = [];
            res.locals.cart = { items: [] };
        }
        next();
    } catch (err) {
        console.error("setCartAndWishlistLocals error:", err);
        res.locals.wishlistProductIds = [];
        res.locals.cart = { items: [] };
        next();
    }
};
