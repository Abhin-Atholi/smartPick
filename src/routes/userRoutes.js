const express = require("express");
const router = express.Router();
const userController = require("../controller/userController");
const authController = require("../controller/authController");
const passport = require("passport");

const { redirectIfVerified, protectRoute, redirectIfAuth, noCache } = require("../middleware/isAuth");

// Auth pages (avoid showing on back button)
router.get("/login", noCache, redirectIfAuth, authController.loadLogin);
router.get("/register", noCache, redirectIfAuth, authController.loadRegister);

router.post("/login", noCache, authController.loginUser);
router.post("/register", noCache, authController.registerUser);

// Verify
router.get("/verify", noCache, redirectIfVerified, authController.loadVerify);
router.post("/verify", noCache, redirectIfVerified, authController.verifyOtp);
router.post("/resend-otp", noCache, redirectIfVerified, authController.resendOtp);

// Public landing
router.get("/", userController.loadHome);

// Protected
router.get("/home", protectRoute, userController.loadHome);
router.get("/logout", noCache, protectRoute, userController.logout);

// Google OAuth
router.get("/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get("/auth/google/callback",
  noCache,
  passport.authenticate("google", { session: false, failureRedirect: "/login" }),
  (req, res) => {
    req.session.userId = req.user._id;
    req.session.user = req.user;

    // ✅ replace history behavior (recommended)
    return res.redirect("/home");
  }
);

router.get("/forgot-password", noCache, redirectIfAuth, authController.loadForgotPassword);
router.post("/forgot-password", noCache, authController.sendResetOtp);

router.get("/reset-password", noCache, redirectIfAuth, authController.loadResetPassword);
router.post("/reset-password", noCache, authController.resetPassword);

router.post("/resend-reset-otp", noCache, authController.resendResetOtp);




module.exports = router;
