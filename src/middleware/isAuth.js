import User from "../model/userModel.js";

// Sets user data for EJS templates (e.g., for navbar 'Login' vs 'Logout' buttons)
export const setAuthLocals = (req, res, next) => {
  res.locals.isAuth = !!req.session?.userId;
  res.locals.user = req.session?.user || null;
  next();
};

// Prevents unauthorized users from accessing certain pages
export const protectRoute = (req, res, next) => {
  if (!req.session?.userId) return res.redirect("/login");
  next();
};

// Prevents logged-in users from seeing the login/register pages
export const redirectIfAuth = (req, res, next) => {
  if (req.session?.userId) return res.redirect("/home");
  next();
};

// If a user is already verified, don't let them stay on the OTP page
export const redirectIfVerified = async (req, res, next) => {
  const email = req.query.email || req.body.email;
  if (!email) return next();

  const user = await User.findOne({ email }).select("isVerified");
  if (user?.isVerified) {
    return req.session?.userId
      ? res.redirect("/home")
      : res.redirect("/login");
  }

  next();
};

// Prevents the browser from caching sensitive pages (important for back-button issues)
export const noCache = (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
};