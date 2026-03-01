import * as authService from "../services/authService.js";
import * as otpService from "../services/otpService.js";
import User from "../model/userModel.js";
import bcrypt from "bcrypt";

export const loadLogin = (req, res) => res.render("user/login", { title: "Login" });

export const loadRegister = (req, res) => res.render("user/register", { title: "Register" });

export const registerUser = async (req, res) => {
  try {
    const result = await authService.register(req.body);

    if (!result.ok && result.needsVerify) {
      return res.redirect(`/verify?email=${encodeURIComponent(result.email || req.body.email)}`);
    }

    if (!result.ok) {
      return res.render("user/register", { title: "Register", msg: result.msg, ...(result.payload || {}) });
    }

    // Fix: Passing object instead of just ID to match otpService signature
    await otpService.sendOtp({ userId: result.user._id, purpose: "verify" });

    return res.redirect(`/verify?email=${encodeURIComponent(result.user.email)}`);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server Error");
  }
};

export const loginUser = async (req, res) => {
  try {
    const result = await authService.login(req.body);

    if (!result.ok && result.needsVerify) {
      return res.redirect(`/verify?email=${encodeURIComponent(result.email || req.body.email)}`);
    }

    if (!result.ok) {
      return res.render("user/login", { title: "Login", msg: result.msg, ...(result.payload || {}) });
    }

    req.session.userId = result.user._id;
    req.session.user = result.user;

    return res.redirect("/home");
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server Error");
  }
};

export const loadVerify = async (req, res) => {
  try {
    const email = req.query.email;
    const user = email ? await User.findOne({ email }).select("isVerified otpLastSentAt") : null;

    if (user?.isVerified) return res.redirect("/login");

    const waitSeconds = otpService.getWaitSeconds(user?.otpLastSentAt);
    return res.render("user/verify", { title: "Verify Account", email, msg: null, waitSeconds });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server Error");
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const result = await otpService.verifyOtp({ email, otp, purpose: "verify" });

    if (!result.ok) {
      return res.render("user/verify", {
        title: "Verify Account",
        email,
        msg: result.msg,
        waitSeconds: result.waitSeconds || 0,
      });
    }

    result.user.isVerified = true;
    await result.user.save();

    return res.redirect("/login");
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server Error");
  }
};

export const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await otpService.sendOtp({ email, purpose: "verify" });

    return res.render("user/verify", {
      title: "Verify Account",
      email: result.email || email,
      msg: result.ok ? "OTP sent again ✅" : result.msg,
      waitSeconds: result.waitSeconds || 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server Error");
  }
};

export const loadForgotPassword = (req, res) => {
  res.render("user/forgot-password", { title: "Forgot Password", msg: null });
};

export const sendResetOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await otpService.sendOtp({ email, purpose: "reset_password" });

    if (!result.ok) {
      return res.render("user/forgot-password", { title: "Forgot Password", msg: result.msg });
    }

    return res.redirect(`/reset-password?email=${encodeURIComponent(result.email)}`);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server Error");
  }
};

export const loadResetPassword = async (req, res) => {
  try {
    const email = req.query.email;
    const user = email ? await User.findOne({ email }).select("otpLastSentAt otpPurpose") : null;

    const waitSeconds = user?.otpPurpose === "reset_password" 
      ? otpService.getWaitSeconds(user.otpLastSentAt) 
      : 0;

    return res.render("user/reset-password", { title: "Reset Password", email, msg: null, waitSeconds });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server Error");
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, otp, password, confirmPassword } = req.body;

    if (!password || password.length < 8) {
      return res.render("user/reset-password", { title: "Reset Password", email, msg: "Password must be at least 8 characters" });
    }
    if (password !== confirmPassword) {
      return res.render("user/reset-password", { title: "Reset Password", email, msg: "Passwords do not match" });
    }

    const result = await otpService.verifyOtp({ email, otp, purpose: "reset_password" });

    if (!result.ok) {
      return res.render("user/reset-password", { title: "Reset Password", email, msg: result.msg });
    }

    result.user.password = await bcrypt.hash(password, 12);
    await result.user.save();

    return res.redirect("/login");
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server Error");
  }
};

export const resendResetOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await otpService.sendOtp({ email, purpose: "reset_password" });

    return res.render("user/reset-password", {
      title: "Reset Password",
      email: result.email || email,
      msg: result.ok ? "OTP sent again ✅" : result.msg,
      waitSeconds: result.waitSeconds || 0,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server Error");
  }
};