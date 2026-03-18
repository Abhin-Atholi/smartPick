import User from "../model/userModel.js";
import TempUser from "../model/tempUserModel.js";
import { sendOtpEmail } from "./emailService.js";

const genOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

export const getRemainingSeconds = (expiry) => {
  const diff = Math.floor((new Date(expiry).getTime() - Date.now()) / 1000);
  return Math.max(0, diff);
};

// Unified function to find a target for verification (used by loadVerify)
export const getVerificationTarget = async (email, context) => {
  const target = context === "changeEmail" 
    ? await User.findOne({ pendingEmail: email })
    : await TempUser.findOne({ email });
  
  if (!target) throw new Error("Session expired. Please start over.");
  return target;
};

/**
 * NEW: Generic Verify for Password Resets
 */
export const verifyOtp = async ({ email, otp, purpose }) => {
  const user = await User.findOne({ email });
  if (!user) return { ok: false, msg: "User not found" };

  if (user.otp !== otp) return { ok: false, msg: "Invalid OTP" };
  if (user.otpPurpose !== purpose) return { ok: false, msg: "Invalid OTP purpose" };
  if (new Date() > user.otpExpires) return { ok: false, msg: "OTP expired" };

  // Success: Clear the OTP fields
  user.otp = undefined;
  user.otpPurpose = undefined;
  user.otpExpires = undefined;
  // Note: We don't save yet; we return the user object so authService can update the password and save.
  return { ok: true, user };
};

/**
 * Unified verification for Registration and Email Changes
 */
export const verifyUniversalOtp = async (email, otp) => {
  // 1. Check for Email Change first
  const user = await User.findOne({ pendingEmail: email });
  if (user) {
    if (user.otp !== otp) throw new Error("Invalid OTP");
    if (new Date() > user.otpExpires) throw new Error("OTP Expired");
    
    user.email = user.pendingEmail;
    user.pendingEmail = null;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();
    return { type: "EMAIL_CHANGE", user };
  }

  // 2. Fallback to Registration (TempUser)
  const tempUser = await TempUser.findOne({ email });
  if (!tempUser) throw new Error("Session expired.");
  if (tempUser.otp !== otp) throw new Error("Invalid OTP");
  if (new Date() > tempUser.otpExpires) throw new Error("OTP Expired");

  const newUser = await User.create({
    fullName: tempUser.fullName,
    email: tempUser.email,
    password: tempUser.password,
    isVerified: true,
    authProvider: "local"
  });

  await TempUser.deleteOne({ _id: tempUser._id });
  return { type: "REGISTRATION", user: newUser };
};

/**
 * Resend Logic
 */
export const resendAnyOtp = async (email) => {
  let target = await User.findOne({ pendingEmail: email }) || await TempUser.findOne({ email });
  if (!target) throw new Error("Session expired.");

  // Check if current OTP is still valid
  if (target.otpExpires && new Date() < target.otpExpires) {
    throw new Error("Please wait for your previous OTP to expire before requesting a new one.");
  }

  const otp = genOtp();
  target.otp = otp;
  target.otpExpires = new Date(Date.now() + 2 * 60 * 1000);
  await target.save();

  await sendOtpEmail(email, otp);
  return getRemainingSeconds(target.otpExpires);
};

/**
 * Existing User OTP (for Password Reset start)
 */
export const sendOtp = async ({ email, purpose }) => {
  const user = await User.findOne({ email });
  if (!user) throw new Error("User not found");

  const otp = genOtp();
  user.otp = otp;
  user.otpPurpose = purpose;
  user.otpExpires = new Date(Date.now() + 2 * 60 * 1000);
  await user.save();

  await sendOtpEmail(email, otp);
  return { ok: true, email };
};