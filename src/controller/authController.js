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

    if (!result.ok) {
      // Handle Verification Redirect
      if (result.needsVerify) {
        return res.redirect(`/verify?email=${encodeURIComponent(result.email || req.body.email)}`);
      }
      
      // Handle Blocked User (Stay on login page and show the block message)
      if (result.isBlocked) {
          return res.render("user/login", { 
              title: "Login", 
              msg: result.msg, 
              email: req.body.email 
          });
      }

      return res.render("user/login", { title: "Login", msg: result.msg, ...(result.payload || {}) });
    }

    // --- THE ABSOLUTE FIX ---
    // We ensure we are saving the EXACT fields the drawer needs
    req.session.userId = result.user._id;
    
    req.session.user = {
      _id: result.user._id,
      fullName: result.user.fullName, // MUST match your Schema
      email: result.user.email,
      profileImage: result.user.profileImage || null // If this is null, drawer shows default
    };

    req.session.save((err) => {
      if (err) return res.status(500).send("Session Error");
      return res.redirect("/home");
    });

  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).send("Server Error");
  }
};

export const loadVerify = async (req, res) => {
  try {
    const { email, context } = req.query;
    if (!email) return res.redirect("/register");

    // Check either TempUser (Register) or User (Email Change)
    const target = context === "changeEmail" 
      ? await User.findOne({ pendingEmail: email })
      : await TempUser.findOne({ email });

    if (!target) return res.redirect("/register?msg=Session expired");

    const diff = Math.floor((new Date(target.otpExpires).getTime() - Date.now()) / 1000);
    const remainingSeconds = Math.max(0, diff);

    return res.render("user/verify", { 
      title: "Verify", 
      email, 
      remainingSeconds, 
      msg: remainingSeconds === 0 ? "OTP Expired" : null 
    });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Check for Email Change first
    const user = await User.findOne({ pendingEmail: email });
    if (user) {
      if (user.otp !== otp || user.otpExpires < Date.now()) {
        return res.render("user/verify", { email, msg: "Invalid/Expired OTP", remainingSeconds: 0 });
      }

      user.email = user.pendingEmail; // Move pending to official
      user.pendingEmail = null;
      user.otp = undefined;
      user.otpExpires = undefined;
      await user.save();

      req.session.user = user.toObject();
      return res.redirect("/account?msg=Email verified successfully! ✅");
    }

    // Fallback to normal Registration logic
    const result = await otpService.verifyRegisterOtp({ email, otp });
    if (!result.ok) {
      return res.render("user/verify", { email, msg: result.msg, remainingSeconds: 0 });
    }
    return res.redirect("/login?msg=Verified! Please login.");
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

export const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    // 1. Check if this is an Email Change (User already exists in permanent User collection)
    const existingUser = await User.findOne({ pendingEmail: email });

    if (existingUser) {
      // Generate new OTP
      const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
      existingUser.otp = newOtp;
      existingUser.otpExpires = new Date(Date.now() + 3 * 60 * 1000); // 3 mins
      await existingUser.save();

      // Send the email (Make sure sendOtpEmail is imported in this file)
      await sendOtpEmail(email, newOtp);

      return res.render("user/verify", {
        title: "Verify New Email",
        email,
        msg: "A fresh OTP has been sent to your new email ✅",
        remainingSeconds: 180, // Reset UI timer
        waitSeconds: 60,       // Lock button for 60s
      });
    }

    // 2. Otherwise, handle normal Registration (TempUser)
    const result = await otpService.resendTempOtp(email);

    if (!result.ok) {
      return res.render("user/verify", {
        title: "Verify Account",
        email,
        msg: result.msg,
        remainingSeconds: 0,
      });
    }

    // Get the fresh expiry for the TempUser to sync the timer
    const tempUser = await TempUser.findOne({ email });
    const diff = Math.floor((new Date(tempUser.otpExpires).getTime() - Date.now()) / 1000);

    return res.render("user/verify", {
      title: "Verify Account",
      email,
      msg: "OTP sent again ✅",
      remainingSeconds: Math.max(0, diff),
      waitSeconds: 60,
    });
  } catch (err) {
    console.error("Resend OTP Error:", err);
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
    const user = await User.findOne({ email });

    if (!user || user.otpPurpose !== "reset_password") {
        return res.redirect("/forgot-password?msg=Session expired.");
    }

    // 🔥 Use the SAME math as loadVerify
    const now = Date.now();
    const expiry = new Date(user.otpExpires).getTime();
    const diff = Math.floor((expiry - now) / 1000);
    const remainingSeconds = diff > 0 ? diff : 0;

    return res.render("user/reset-password", { 
        title: "Reset Password", 
        email, 
        msg: remainingSeconds === 0 ? "OTP Expired. Please resend." : null, 
        remainingSeconds: remainingSeconds // Use this for the 3-min countdown
    });
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
    
    // 1. Trigger the service to generate new OTP and new otpExpires
    const result = await otpService.sendOtp({ email, purpose: "reset_password" });

    if (!result.ok) {
      return res.render("user/reset-password", {
        title: "Reset Password",
        email,
        msg: result.msg,
        remainingSeconds: 0 // Keep it at 0 if it failed
      });
    }

    // 2. Fetch the updated user to get the NEW otpExpires timestamp
    const user = await User.findOne({ email });
    
    // 3. Calculate the fresh 3-minute gap (or whatever your service sets)
    const now = Date.now();
    const expiry = new Date(user.otpExpires).getTime();
    const remainingSeconds = Math.max(0, Math.floor((expiry - now) / 1000));

    // 4. Render with the NEW time
    return res.render("user/reset-password", {
      title: "Reset Password",
      email,
      msg: "A new OTP has been sent to your email ✅",
      remainingSeconds: remainingSeconds // 🔥 This resets the frontend timer
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send("Server Error");
  }
};