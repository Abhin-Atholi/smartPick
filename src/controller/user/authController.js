import * as authService from "../../services/user/authService.js";
import * as otpService from "../../services/common/otpService.js";
import passport from "passport";


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
    const remainingSeconds = await otpService.getRemainingSeconds(email, "reset_password");
    
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
    console.log("got u")
    res.redirect(`/reset-password?email=${encodeURIComponent(req.body.email)}&msg=${encodeURIComponent(err.message)}`);
  }
};

/** * REGISTRATION & LOGIN FLOW 
 */
export const registerUser = async (req, res) => {
  try {
    const result = await authService.register(req.body);
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

/** * GOOGLE AUTH FLOW 
 */
export const googleAuth = passport.authenticate("google", { scope: ["profile", "email"] });

export const backupAdminSession = (req, res, next) => {
  req.sessionBackup = {
    adminId: req.session.adminId,
    admin: req.session.admin
  };
  next();
};

export const googleAuthAuthenticate = passport.authenticate("google", { failureRedirect: "/login", keepSessionInfo: true });

export const googleAuthCallback = (req, res) => {
  if (req.sessionBackup?.adminId && req.sessionBackup?.admin) {
    req.session.adminId = req.sessionBackup.adminId;
    req.session.admin = req.sessionBackup.admin;
  }

  req.session.userId = req.user._id;
  req.session.user = req.user;

  res.redirect("/home");
};

/** * VERIFICATION & OTP 
 */
export const loadVerify = async (req, res) => {
  try {
    const { email, context, msg } = req.query;
    const target = await otpService.getVerificationTarget(email, context);
    const purpose = context === "changeEmail" ? "changeEmail" : "register";
    const remainingSeconds = await otpService.getRemainingSeconds(email, purpose);
    
    res.render("user/verify", { 
      title: "Verify", 
      email, 
      purpose,
      remainingSeconds, 
      msg: msg || (remainingSeconds === 0 ? "OTP Expired" : null) 
    });
  } catch (err) {
    res.redirect("/register?msg=" + encodeURIComponent(err.message));
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const result = await otpService.verifyUniversalOtp(req.body.email, req.body.otp, req.body.purpose);
    if (result.type === "EMAIL_CHANGE") {
      req.session.user.email = result.user.email;
      return res.redirect("/account?msg=Email updated! ✅");
    }
    
    req.session.userId = result.user._id;
    
    req.session.user = {
      _id: result.user._id,
      fullName: result.user.fullName,
      email: result.user.email,
      role: result.user.role,
      profileImage: result.user.profileImage || null
    };
    req.session.save(() => res.redirect("/home"));
  } catch (err) {
    res.redirect(`/verify?email=${encodeURIComponent(req.body.email)}&msg=${encodeURIComponent(err.message)}`);
  }
};

export const resendOtp = async (req, res) => {
  try {
    const isReset = req.originalUrl.includes("reset");
    const explicitPurpose = isReset ? "reset_password" : req.body.purpose;
    
    const remainingSeconds = await otpService.resendAnyOtp(req.body.email, explicitPurpose);
    
    if (isReset) {
      res.redirect(`/reset-password?email=${encodeURIComponent(req.body.email)}&msg=OTP+sent+again+✅`);
    } else {
      res.redirect(`/verify?email=${encodeURIComponent(req.body.email)}&context=${req.body.purpose === 'changeEmail' ? 'changeEmail' : 'register'}&msg=OTP+sent+again+✅`);
    }
  } catch (err) {
    const isReset = req.originalUrl.includes("reset");
    if (isReset) {
      res.redirect(`/reset-password?email=${encodeURIComponent(req.body.email)}&msg=${encodeURIComponent(err.message)}`);
    } else {
      res.redirect(`/verify?email=${encodeURIComponent(req.body.email)}&context=${req.body.purpose === 'changeEmail' ? 'changeEmail' : 'register'}&msg=${encodeURIComponent(err.message)}`);
    }
  }
};
