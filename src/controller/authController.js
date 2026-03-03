import * as authService from "../services/authService.js";
import * as otpService from "../services/otpService.js";
import TempUser from "../model/tempUserModel.js"
import User from "../model/userModel.js";
import bcrypt from "bcrypt";
import { sendOtpEmail } from "../services/emailService.js"; // Ensure import

export const loadLogin = (req, res) => res.render("user/login", { title: "Login" });

export const loadRegister = (req, res) => res.render("user/register", { title: "Register" });



export const registerUser = async (req, res) => {
  try {
    const result = await authService.register(req.body);

    if (!result.ok) {
      return res.render("user/register", { title: "Register", msg: result.msg, ...(result.payload || {}) });
    }

    // Use your email service directly with the OTP from the result
    await sendOtpEmail(result.email, result.otp);

    return res.redirect(`/verify?email=${encodeURIComponent(result.email)}`);
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
    if (!email) return res.redirect("/register");
    
    const tempUser = await TempUser.findOne({ email });
    
    if (!tempUser) {
        const verifiedUser = await User.findOne({ email });
        if (verifiedUser) return res.redirect("/login?msg=Already verified");
        return res.redirect("/register?msg=Session expired. Please register again.");
    }

    // 🔥 FIX: Precise millisecond calculation
    const now = Date.now();
    const expiry = new Date(tempUser.otpExpires).getTime();
    const diff = Math.floor((expiry - now) / 1000);
    
    // If diff is 180, it shows 3:00. If negative, it shows 0.
    const remainingSeconds = diff > 0 ? diff : 0;

    return res.render("user/verify", { 
        title: "Verify Account", 
        email, 
        msg: remainingSeconds === 0 ? "OTP Expired. Please resend." : null, 
        remainingSeconds: remainingSeconds 
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server Error");
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    // Use the NEW promotion service you added to otpService
    const result = await otpService.verifyRegisterOtp({ email, otp });

    if (!result.ok) {
      return res.render("user/verify", {
        title: "Verify Account",
        email,
        msg: result.msg,
        waitSeconds: 0, 
      });
    }

    // No need to manually set isVerified or save here; 
    // verifyRegisterOtp does it and moves the user to the permanent DB.
    return res.redirect("/login?msg=Verified successfully. Please login.");
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server Error");
  }
};

export const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await otpService.resendTempOtp(email);

    if (!result.ok) {
        return res.render("user/verify", { title: "Verify Account", email, msg: result.msg, remainingSeconds: 0, waitSeconds: 0 });
    }

    // 🔥 Re-fetch tempUser to get the new 'otpExpires' timestamp
    const tempUser = await TempUser.findOne({ email });
    const remainingSeconds = Math.max(0, Math.floor((new Date(tempUser.otpExpires).getTime() - Date.now()) / 1000));

    return res.render("user/verify", {
      title: "Verify Account",
      email,
      msg: "OTP sent again ✅",
      remainingSeconds, // 🔥 Reset the 3-minute timer on UI
      waitSeconds: 60,   // Lock the button for 60s
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