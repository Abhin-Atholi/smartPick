import bcrypt from "bcrypt";
import User from "../model/userModel.js";
import TempUser from "../model/tempUserModel.js";
import * as otpService from "./otpService.js";

/**
 * Register: Handles temporary user creation and OTP generation
 */
export const register = async ({ name, email, password, confirmPassword }) => {
  if (!name && !email && !password && !confirmPassword) throw new Error("All fields are required");
  if (name.length<3) throw new Error("Name should have atleast 3 characters");
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) throw new Error("Invalid email format");
  if (password.length < 8) throw new Error("Password must have at least 8 characters");
  if (password !== confirmPassword) throw new Error("Passwords do not match");

  const existing = await User.findOne({ email });
  if (existing) throw new Error("User already exists");

  const hashedPassword = await bcrypt.hash(password, 12);
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  await TempUser.findOneAndUpdate(
    { email },
    {
      fullName: name,
      email,
      password: hashedPassword,
      otp,
      otpExpires: new Date(Date.now() + 2 * 60 * 1000)
    },
    { upsert: true, new: true }
  );

  return { email, otp }; 
};

/**
 * Login: Handles credentials, block status, and verification checks
 */
export const login = async ({ email, password }) => {
  if (!email || !password) throw new Error("Please fill all fields");

  const user = await User.findOne({ email });
  if (!user) throw new Error("No user found, please register first");
  // Inside your login function
if (user.role !== 'user') {
    throw new Error("Admins must login through the admin portal.");
}

  if (user.status === "blocked") throw new Error("Your account has been suspended.");

  // Security: Check for missing passwords (OAuth users or corrupted records)
  if (!user.password) {
    if (user.authProvider === "google") {
      throw new Error("Please use 'Continue with Google' to login.");
    }
    throw new Error("Account has no password set. Please reset your password.");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error("Email or password is wrong");

  if (!user.isVerified) {
    const err = new Error("Please verify your account");
    err.needsVerify = true; // Controller uses this to redirect
    err.email = user.email;
    throw err;
  }

  return user;
};

/**
 * Finalize Password Reset: Hashing new password after OTP success
 */
export const finalizePasswordReset = async ({ email, otp, password, confirmPassword }) => {
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
  if (password !== confirmPassword) throw new Error("Passwords do not match");

  const result = await otpService.verifyOtp({ email, otp, purpose: "reset_password" });
  
  if (!result.ok) throw new Error(result.msg);

  // result.user is the Mongoose document returned by otpService
  const user = result.user;
  user.password = await bcrypt.hash(password, 12);
  
  // Clear any remaining OTP fields just in case
  user.otp = undefined;
  user.otpPurpose = undefined;
  user.otpExpires = undefined;

  await user.save();
};