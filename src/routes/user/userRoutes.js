import express from "express"
const router = express.Router();
import * as userController from "../../controller/user/userController.js";
import * as authController from "../../controller/user/authController.js";
import * as accountController from "../../controller/user/accountController.js";
import { redirectIfVerified, protectRoute, redirectIfAuth, checkBlocked } from "../../middleware/user/isAuth.js";
import { profileUploadMiddleware } from "../../middleware/user/profileUpload.js";

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
router.get("/auth/google", authController.googleAuth);

router.get("/auth/google/callback",
  authController.backupAdminSession,
  authController.googleAuthAuthenticate,
  authController.googleAuthCallback
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
router.put("/account/update-profile", protectRoute, profileUploadMiddleware, accountController.updateProfile);
router.delete("/account/remove-image", protectRoute, accountController.removeProfileImage);




router.get("/account/addresses", protectRoute, accountController.loadAddresses);
router.post("/account/addresses", protectRoute, accountController.addAddress);
router.put("/account/addresses/:id", protectRoute, accountController.updateAddress);
router.delete("/account/addresses/:id", protectRoute, accountController.deleteAddress);

router.get("/account/security", protectRoute, accountController.loadSecurity);
router.put("/account/update-password", protectRoute, accountController.updatePassword);

export default router;
