import express from "express";
import passport from "passport";
const router = express.Router();
import * as authController from "../../controller/user/authController.js";
import { redirectIfVerified, redirectIfAuth } from "../../middleware/user/isAuth.js";
import { loginLimiter, registerLimiter, otpLimiter } from "../../middleware/user/authRateLimiter.js";

// Auth pages (avoid showing on back button)
router.get("/login", redirectIfAuth, authController.loadLogin);
router.get("/register", redirectIfAuth, authController.loadRegister);

router.post("/login", loginLimiter, authController.loginUser);
router.post("/register", registerLimiter, authController.registerUser);

// Validation
router.get("/check-email", authController.checkEmail);

// Verify
router.get("/verify", redirectIfVerified, authController.loadVerify);
router.post("/verify", redirectIfVerified, authController.verifyOtp);
router.post("/resend-otp", redirectIfVerified, otpLimiter, authController.resendOtp);

// --- Forgot Password Flow ---
router.get("/forgot-password", redirectIfAuth, authController.loadForgotPassword);
router.post("/forgot-password", otpLimiter, authController.sendResetOtp);

// --- Reset Password Flow ---
router.get("/reset-password", redirectIfAuth, authController.loadResetPassword);
router.post("/reset-password", authController.resetPassword);

// --- Resend Logic (Now unified) ---
router.post("/resend-reset-otp", otpLimiter, authController.resendOtp);

// --- Google Auth ---
router.get("/auth/google", authController.googleAuth);

router.get("/auth/google/callback",
  authController.backupAdminSession,
  authController.googleAuthAuthenticate,
  authController.googleAuthCallback
);

export default router;
