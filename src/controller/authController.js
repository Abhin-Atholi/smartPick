import * as authService from "../services/authService.js";
import * as otpService from "../services/otpService.js";
import { sendOtpEmail } from "../services/emailService.js";

export const loadLogin = (req, res) => res.render("user/login", { title: "Login", msg: req.query.msg || null, email: req.query.email || "" });
export const loadRegister = (req, res) => res.render("user/register", { title: "Register", msg: req.query.msg || null, name: req.query.name || "", email: req.query.email || "" });

/** * FORGOT PASSWORD FLOW 
 */
export const loadForgotPassword = (req, res) => {
  res.render("user/forgot-password", { title: "Forgot Password", msg: req.query.msg || null });
};

export const sendResetOtp = async (req, res) => {
  try {
    const { email } = req.body;
    // otpService.sendOtp finds user, generates OTP, and saves it
    await otpService.sendOtp({ email, purpose: "reset_password" });
    res.redirect(`/reset-password?email=${encodeURIComponent(email)}`);
  } catch (err) {
    res.redirect(`/forgot-password?msg=${encodeURIComponent(err.message)}`);
  }
};

export const loadResetPassword = async (req, res) => {
  try {
    const { email, msg } = req.query;
    // Pass 'null' or a dummy context because it's looking in the permanent User collection
    const target = await otpService.getVerificationTarget(email, "resetPassword"); 
    const remainingSeconds = otpService.getRemainingSeconds(target.otpExpires);
    
    res.render("user/reset-password", { 
      title: "Reset Password", 
      email, 
      remainingSeconds, 
      msg: msg || (remainingSeconds === 0 ? "OTP Expired" : null) 
    });
  } catch (err) {
    res.redirect("/forgot-password?msg=" + encodeURIComponent(err.message));
  }
};

export const resetPassword = async (req, res) => {
  try {
    await authService.finalizePasswordReset(req.body);
    res.redirect("/login?msg=Password reset successful! ✅");
  } catch (err) {
    res.redirect(`/reset-password?email=${encodeURIComponent(req.body.email)}&msg=${encodeURIComponent(err.message)}`);
  }
};

/** * REGISTRATION & LOGIN FLOW 
 */
export const registerUser = async (req, res) => {
  try {
    const result = await authService.register(req.body);
    await sendOtpEmail(result.email, result.otp); 
    res.redirect(`/verify?email=${encodeURIComponent(result.email)}`);
  } catch (err) {
    res.redirect(`/register?msg=${encodeURIComponent(err.message)}&name=${encodeURIComponent(req.body.name || "")}&email=${encodeURIComponent(req.body.email || "")}`);
  }
};

export const loginUser = async (req, res) => {
  try {
    const user = await authService.login(req.body);
    req.session.userId = user._id;
    req.session.user = {
      _id: user._id,
      fullName: user.fullName,
      email: user.email,
      role:user.role,
      profileImage: user.profileImage || null
    };
    req.session.save(() => res.redirect("/home"));
  } catch (err) {
    if (err.needsVerify) return res.redirect(`/verify?email=${encodeURIComponent(err.email)}`);
    res.redirect(`/login?msg=${encodeURIComponent(err.message)}&email=${encodeURIComponent(req.body.email || "")}`);
  }
};

/** * VERIFICATION & OTP 
 */
export const loadVerify = async (req, res) => {
  try {
    const { email, context, msg } = req.query;
    const target = await otpService.getVerificationTarget(email, context);
    const remainingSeconds = otpService.getRemainingSeconds(target.otpExpires);
    
    res.render("user/verify", { 
      title: "Verify", 
      email, 
      remainingSeconds, 
      msg: msg || (remainingSeconds === 0 ? "OTP Expired" : null) 
    });
  } catch (err) {
    res.redirect("/register?msg=" + encodeURIComponent(err.message));
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const result = await otpService.verifyUniversalOtp(req.body.email, req.body.otp);
    if (result.type === "EMAIL_CHANGE") {
      req.session.user.email = result.user.email;
      return res.redirect("/account?msg=Email updated! ✅");
    }
    res.redirect("/login?msg=Verified! Please login.");
  } catch (err) {
    res.redirect(`/verify?email=${encodeURIComponent(req.body.email)}&msg=${encodeURIComponent(err.message)}`);
  }
};

export const resendOtp = async (req, res) => {
  try {
    const remainingSeconds = await otpService.resendAnyOtp(req.body.email);
    // Even on success we can just redirect so they don't get stuck on a POST resubmission if they hit back
    res.redirect(`/verify?email=${encodeURIComponent(req.body.email)}&msg=OTP+sent+again+✅`);
  } catch (err) {
    res.redirect(`/verify?email=${encodeURIComponent(req.body.email)}&msg=${encodeURIComponent(err.message)}`);
  }
};