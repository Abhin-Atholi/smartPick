const authService = require("../services/authService");
const otpService = require("../services/otpService");
const User = require("../model/userModel");
 const bcrypt = require("bcrypt");

const loadLogin = (req, res) => res.render("user/login", { title: "Login" });
const loadRegister = (req, res) => res.render("user/register", { title: "Register" });

const registerUser = async (req, res) => {
  try {
    const result = await authService.register(req.body);

    if (!result.ok && result.needsVerify) {
      return res.redirect(`/verify?email=${encodeURIComponent(result.email || req.body.email)}`);
    }

    if (!result.ok) {
      return res.render("user/register", { title: "Register", msg: result.msg, ...(result.payload || {}) });
    }

    await otpService.sendVerifyOtpByUserId(result.user._id);

    return res.redirect(`/verify?email=${encodeURIComponent(result.user.email)}`);
  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};

const loginUser = async (req, res) => {
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
    console.log(err);
    return res.status(500).send("Server Error");
  }
};

const loadVerify = async (req, res) => {
  try {
    const email = req.query.email;

    const user = email
      ? await User.findOne({ email }).select("isVerified otpLastSentAt")
      : null;

    if (user?.isVerified) return res.redirect("/login");

    const waitSeconds = otpService.getWaitSeconds(user?.otpLastSentAt);

    return res.render("user/verify", { title: "Verify Account", email, msg: null, waitSeconds });
  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};

const verifyOtp = async (req, res) => {
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

    // Mark verified only AFTER otp success
    result.user.isVerified = true;
    await result.user.save();

    return res.redirect("/login");
  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};


const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await otpService.sendOtp({ email, purpose: "verify" });

    if (!result.ok) {
      return res.render("user/verify", {
        title: "Verify Account",
        email,
        msg: result.msg,
        waitSeconds: result.waitSeconds || 0,
      });
    }

    return res.render("user/verify", {
      title: "Verify Account",
      email: result.email,
      msg: "OTP sent again ✅",
      waitSeconds: result.waitSeconds,
    });

  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};


const loadForgotPassword = (req, res) => {
  res.render("user/forgot-password", { title: "Forgot Password", msg: null });
};

const sendResetOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await otpService.sendOtp({ email, purpose: "reset_password" });

    if (!result.ok) {
      return res.render("user/forgot-password", { title: "Forgot Password", msg: result.msg });
    }

    return res.redirect(`/reset-password?email=${encodeURIComponent(result.email)}`);
  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};

const loadResetPassword = async (req, res) => {
  try {
    const email = req.query.email;

    const user = email
      ? await User.findOne({ email }).select("otpLastSentAt otpPurpose")
      : null;

    // only show timer if current otp is for reset_password
    const waitSeconds =
      user?.otpPurpose === "reset_password"
        ? otpService.getWaitSeconds(user.otpLastSentAt)
        : 0;

    return res.render("user/reset-password", {
      title: "Reset Password",
      email,
      msg: null,
      waitSeconds,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};


const resetPassword = async (req, res) => {
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
    console.log(err);
    return res.status(500).send("Server Error");
  }
};

const resendResetOtp = async (req, res) => {
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
    console.log(err);
    return res.status(500).send("Server Error");
  }
};



module.exports = { loadLogin, loadRegister, registerUser, loginUser, loadVerify, verifyOtp, resendOtp,loadForgotPassword,loadResetPassword,resetPassword,sendResetOtp ,resendResetOtp};
