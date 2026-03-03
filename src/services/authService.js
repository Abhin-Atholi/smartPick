// src/services/authService.js

import bcrypt from "bcrypt";
import User from "../model/userModel.js";
import TempUser from "../model/tempUserModel.js"; // Ensure filename matches exactly

export const register = async ({ name, email, password, confirmPassword }) => {
    // 1. Validation Logic
  if (!name && !email && !password && !confirmPassword) {
    return { ok: false, msg: "All fields are required", payload: { name, email } };
  }
  if (!name ) {
    return { ok: false, msg: "name is required", payload: { name, email } };
  }
  if (!email ) {
    return { ok: false, msg: "email is required", payload: { name, email } };
  }

  if (password.length < 8) {
    return { ok: false, msg: "Password must have at least 8 characters", payload: { name, email } };
  }

  if (password !== confirmPassword) {
    return { ok: false, msg: "Passwords do not match", payload: { name, email } };
  }

    // 2. Check Permanent Collection
    const existing = await User.findOne({ email });
    if (existing) {
        return { ok: false, msg: "User already exists", payload: { name, email } };
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Save to Temporary Collection (Waiting Room)
    await TempUser.findOneAndUpdate(
        { email },
        {
            fullName: name,
            email,
            password: hashedPassword,
            otp,
            otpExpires: new Date(Date.now() + 3 * 60 * 1000)
            // TTL index in model handles the deletion automatically
        },
        { upsert: true, new: true }
    );

    // Return the data needed for the email
    return { ok: true, email, otp }; 
};

export const login = async ({ email, password }) => {
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
  


