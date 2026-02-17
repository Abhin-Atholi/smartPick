// src/controller/authController.js
const authService = require("../services/authService");
const { sendOtpEmail } = require("../services/emailService");


const loadLogin = (req, res) => {
  res.render("user/login", { title: "Login" });
};

const loadRegister = (req, res) => {
  res.render("user/register", { title: "Register" });
};

// src/controller/authController.js
const User = require("../model/userModel"); // ✅ add this import at top

const registerUser = async (req, res) => {
  try {
    const result = await authService.register(req.body);

    if (!result.ok) {
      return res.render("user/register", {
        title: "Register",
        msg: result.msg,
        ...(result.payload || {}),
      });
    }

    // ✅ generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // ✅ store OTP in DB
    await User.updateOne(
      { _id: result.user._id },
      {
        $set: {
          otp,
          otpExpires: new Date(Date.now() + 10 * 60 * 1000),
          isVerified: false,
        },
      }
    );

    // ✅ send email
    await sendOtpEmail(result.user.email, otp);

    // ✅ go to verify page
    return res.redirect(`/verify?email=${encodeURIComponent(result.user.email)}`);
  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};


const loginUser = async (req, res) => {
  try {
    const result = await authService.login(req.body);

    if (!result.ok) {
      return res.render("user/login", {
        title: "Login",
        msg: result.msg,
        ...(result.payload || {}),
      });
    }

    // ✅ set session (minimal + safe)
    req.session.userId = result.user._id;
    req.session.user = result.user;

    return res.redirect("/home"); // recommended protected route
  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};


const loadVerify = (req, res) => {
  res.render("user/verify", {
    title: "Verify Account",
    email: req.query.email,
    msg: null,
  });
};

const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.redirect("/register");

    if (!user.otp || !user.otpExpires) {
      return res.render("user/verify", { title: "Verify Account", email, msg: "OTP not found. Please register again." });
    }

    if (user.otpExpires < new Date()) {
      return res.render("user/verify", { title: "Verify Account", email, msg: "OTP expired. Please register again." });
    }

    if (user.otp !== otp) {
      return res.render("user/verify", { title: "Verify Account", email, msg: "Invalid OTP" });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    return res.redirect("/login");
  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};


module.exports = { loadLogin, loadRegister, registerUser, loginUser,loadVerify,verifyOtp };
