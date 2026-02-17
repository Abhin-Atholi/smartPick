// src/services/authService.js
const bcrypt = require("bcrypt");
const User = require("../model/userModel");

// returns { ok:false, msg, payload? } OR { ok:true, user }
const register = async ({ name, email, password, confirmPassword }) => {
  if (!name || !email || !password || !confirmPassword) {
    return { ok: false, msg: "All fields are required", payload: { name, email } };
  }

  if (password.length < 8) {
    return { ok: false, msg: "Password must have at least 8 characters", payload: { name, email } };
  }

  if (password !== confirmPassword) {
    return { ok: false, msg: "Passwords do not match", payload: { name, email } };
  }

  const existing = await User.findOne({ email });
  
  if (existing && existing.isVerified) {
    return { ok: false, msg: "User already exists", payload: { name, email } };
  }

  // ✅ exists but not verified → resend/verify flow
  if (existing && !existing.isVerified) {
    return { ok: false, needsVerify: true, email: existing.email, msg: "Please verify your account", payload: { name, email } };
  }


  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await User.create({
    email,
    fullName: name,
    password: hashedPassword,
  });

  return {
    ok: true,
    user: { _id: user._id, name: user.fullName, email: user.email },
  };
};

const login = async ({ email, password }) => {
  if (!email || !password) {
    return { ok: false, msg: "All fields are required", payload: { email } };
  }

  if (password.length < 8) {
    return { ok: false, msg: "Password must have at least 8 characters", payload: { email } };
  }

  const user = await User.findOne({ email });
  if (!user) {
    return { ok: false, msg: "No users found, please register first", payload: { email } };
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
  return { ok: false, msg: "Email or password is wrong", payload: { email } };
  }
  // ✅ ADD THIS BLOCK HERE
if (!user.isVerified) {
  return {
    ok: false,
    needsVerify: true,
    email: user.email,
    msg: "Please verify your account",
    payload: { email }
  };
}

// ✅ THEN SUCCESS
return {
  ok: true,
  user: { _id: user._id, name: user.fullName, email: user.email },
};
}
  

module.exports = { register, login };
