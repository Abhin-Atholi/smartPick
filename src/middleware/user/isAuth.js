import User from "../../model/userModel.js";

export const setAuthLocals = (req, res, next) => {
    // 🛠️ FIX 1: If the user has an old admin session in req.session.user, clean it up!
    if (req.session?.user?.role === 'admin') {
        req.session.adminId = req.session.user._id;
        req.session.admin = req.session.user;
        delete req.session.user;
    }

    // 🛠️ FIX 2: Restore Passport.js support (req.user)
    const currentUser = req.user || req.session?.user || null;

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
};

/**
 * Middleware to check if a logged-in user has been blocked.
 * If blocked, it destroys the session and redirects to login.
 */
export const protectRoute = (req, res, next) => {
  const currentUser = req.user || req.session?.user || null;
  if (!currentUser) return res.redirect("/login");
  next();
};

export const checkBlocked = async (req, res, next) => {
  try {
    const currentUser = req.user || req.session?.user || null;
    if (!currentUser?._id) {
      return next();
    }

    const user = await User.findById(currentUser._id).select("status");

    if (!user || user.status === "blocked") {
        // Only clear user-specific session data, preserve admin session
        delete req.session.userId;
        delete req.session.user;
        delete req.session.passport; // Passport stores user ref here

        // Clear Passport's req.user for the current request
        // (Don't use req.logout() — Passport 0.6+ regenerates the session, wiping admin data)
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
