import express from "express"
const router = express.Router();
import * as userController from "../controller/userController.js";
import * as authController from "../controller/authController.js";
import passport from "passport";
import * as accountController from "../controller/accountController.js";
import upload from "../middleware/multer.js";
import { redirectIfVerified, protectRoute, redirectIfAuth, checkBlocked } from "../middleware/isAuth.js";

router.use(checkBlocked);


// Auth pages (avoid showing on back button)
router.get("/login", redirectIfAuth, authController.loadLogin);
router.get("/register", redirectIfAuth, authController.loadRegister);

router.post("/login", authController.loginUser);
router.post("/register", authController.registerUser);

// Verify
router.get("/verify", redirectIfVerified, authController.loadVerify);
router.post("/verify", redirectIfVerified, authController.verifyOtp);
router.post("/resend-otp", redirectIfVerified, authController.resendOtp);

// Public landing
router.get("/", userController.loadHome);

// Protected
router.get("/home", protectRoute, userController.loadHome);
router.get("/logout", protectRoute, userController.logout);

// Google OAuth
router.get("/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get("/auth/google/callback",
  (req, res, next) => {
    // Passport 0.6.0+ regenerates the session during login, destroying custom variables.
    // We must back up the admin session BEFORE passport.authenticate runs.
    req.sessionBackup = {
      adminId: req.session.adminId,
      admin: req.session.admin
    };
    next();
  },
  passport.authenticate("google", { failureRedirect: "/login", keepSessionInfo: true }),
  (req, res) => {
    // Restore admin if they were logged in
    if (req.sessionBackup?.adminId && req.sessionBackup?.admin) {
      req.session.adminId = req.sessionBackup.adminId;
      req.session.admin = req.sessionBackup.admin;
    }

    // Passport automatically populates req.user
    req.session.userId = req.user._id;
    req.session.user = req.user;

    res.redirect("/home");
  }
);


// --- Forgot Password Flow ---
router.get("/forgot-password", redirectIfAuth, authController.loadForgotPassword);
router.post("/forgot-password", authController.sendResetOtp);

// --- Reset Password Flow ---
router.get("/reset-password", redirectIfAuth, authController.loadResetPassword);
router.post("/reset-password", authController.resetPassword);

// --- Resend Logic (Now unified) ---
router.post("/resend-reset-otp", authController.resendOtp);



router.get("/account", protectRoute, accountController.loadAccount);
router.post("/account/update-profile", protectRoute, upload.single("profileImage"), accountController.updateProfile);
router.post("/account/remove-image", protectRoute, accountController.removeProfileImage);




router.get("/account/addresses", protectRoute, accountController.loadAddresses);
router.post("/account/addresses", protectRoute, accountController.addAddress);

router.post("/account/addresses/:id", protectRoute, accountController.updateAddress);

router.post("/account/addresses/:id/delete", protectRoute, accountController.deleteAddress);

router.get("/account/security", protectRoute, accountController.loadSecurity);
router.post("/account/update-password", protectRoute, accountController.updatePassword);

export default router;
