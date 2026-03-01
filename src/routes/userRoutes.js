import express from "express"
const router = express.Router();
import * as userController from "../controller/userController.js";
import * as authController from "../controller/authController.js";
import passport from "passport";
import * as accountController from "../controller/accountController.js";


import { redirectIfVerified, protectRoute, redirectIfAuth, noCache } from "../middleware/isAuth.js";

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
  passport.authenticate("google", { failureRedirect: "/login" }), // Removed session:false
  (req, res) => {
    // Passport automatically populates req.user
    req.session.userId = req.user._id;
    req.session.user = req.user; 
    res.redirect("/home");
  }
);

router.get("/forgot-password", noCache, redirectIfAuth, authController.loadForgotPassword);
router.post("/forgot-password", noCache, authController.sendResetOtp);

router.get("/reset-password", noCache, redirectIfAuth, authController.loadResetPassword);
router.post("/reset-password", noCache, authController.resetPassword);

router.post("/resend-reset-otp", noCache, authController.resendResetOtp);

router.get("/account", protectRoute, accountController.loadAccount);
router.post("/account/profile", protectRoute, accountController.updateProfile);




router.get("/account/addresses", protectRoute, accountController.loadAddresses);
router.post("/account/addresses", protectRoute, accountController.addAddress);

router.get("/account/addresses/:id/edit", protectRoute, accountController.loadEditAddress);
router.post("/account/addresses/:id", protectRoute, accountController.updateAddress);

router.post("/account/addresses/:id/delete", protectRoute, accountController.deleteAddress);

export default router;
