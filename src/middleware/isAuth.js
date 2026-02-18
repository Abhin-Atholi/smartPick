const User = require("../model/userModel");


const setAuthLocals = (req, res, next) => {
  res.locals.isAuth = !!req.session.userId;
  res.locals.user = req.session.user || null;
  next();
};

const protectRoute = (req, res, next) => {
  if (!req.session.userId) return res.redirect("/login");
  next();
};

// ✅ add this
const redirectIfAuth = (req, res, next) => {
  if (req.session.userId) return res.redirect("/home");
  next();
};


const redirectIfVerified = async (req, res, next) => {
  const email = req.query.email || req.body.email;
  if (!email) return next();

  const user = await User.findOne({ email }).select("isVerified");
  if (user?.isVerified) {
    return req.session.userId
      ? res.redirect("/home")
      : res.redirect("/login");
  }

  next();
};


const noCache = (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
};
module.exports = { setAuthLocals, protectRoute, redirectIfAuth, redirectIfVerified, noCache};
