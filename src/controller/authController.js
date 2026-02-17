const authService = require("../services/authService");
const otpService = require("../services/otpService");
const User = require("../model/userModel");

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

    const user = await User.findOne({ email });
    if (!user) return res.redirect("/register");

    if (!user.otp || !user.otpExpires) {
      return res.render("user/verify", { title: "Verify Account", email, msg: "OTP not found. Please register again.", waitSeconds: 0 });
    }

    if (user.otpExpires < new Date()) {
      return res.render("user/verify", { title: "Verify Account", email, msg: "OTP expired. Please resend OTP.", waitSeconds: 0 });
    }

    if (user.otp !== otp) {
      const waitSeconds = otpService.getWaitSeconds(user.otpLastSentAt);
      return res.render("user/verify", { title: "Verify Account", email, msg: "Invalid OTP", waitSeconds });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    user.otpLastSentAt = null;
    await user.save();

    return res.redirect("/login");
  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};

const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await otpService.resendVerifyOtpByEmail(email);

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
      msg: result.msg,
      waitSeconds: result.waitSeconds,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};

module.exports = { loadLogin, loadRegister, registerUser, loginUser, loadVerify, verifyOtp, resendOtp };
