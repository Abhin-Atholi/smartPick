import User from "../../model/userModel.js";
import TempUser from "../../model/tempUserModel.js";
import Otp from "../../model/otpModel.js";
import { sendOtpEmail } from "./emailService.js";
import * as walletService from "../user/walletService.js";

const REFERRER_REWARD = 100;
const REFERRED_REWARD = 50;

const genOtp = () => Math.floor(100000 + Math.random() * 900000).toString();


export const getRemainingSeconds = async (email, purpose) => {
  if (!email) return 0;
  const normalizedEmail = email.trim().toLowerCase();
  const otpRecord = await Otp.findOne({ email: normalizedEmail, purpose });
  if (!otpRecord) return 0;
  
  // Model TTL is 120s (2 minutes)
  const expiresAt = new Date(otpRecord.createdAt).getTime() + 120000;
  const diff = Math.floor((expiresAt - Date.now()) / 1000);
  return Math.max(0, diff);
};

// Unified function to find a target for verification (used by loadVerify)
export const getVerificationTarget = async (email, context) => {
  if (!email) throw new Error("Session expired. Please start over.");
  
  const normalizedEmail = email.trim().toLowerCase();
  let target;
  
  if (context === "changeEmail") {
    target = await User.findOne({ pendingEmail: normalizedEmail });
  } else if (context === "resetPassword") {
    target = await User.findOne({ email: normalizedEmail });
  } else {
    // register context
    target = await TempUser.findOne({ email: normalizedEmail });
  }
  
  if (!target) throw new Error("Session expired. Please start over.");
  return target;
};

export const verifyOtp = async ({ email, otp, purpose }) => {
  if (!email) return { ok: false, msg: "Email is required" };
  const normalizedEmail = email.trim().toLowerCase();
  const otpRecord = await Otp.findOne({ email: normalizedEmail, purpose });
  if (!otpRecord) return { ok: false, msg: "OTP expired or invalid" };

  if (otpRecord.otp !== otp) return { ok: false, msg: "Invalid OTP" };

  // Validated! Delete the OTP
  await Otp.deleteOne({ _id: otpRecord._id });

  let user;
  if (purpose === "changeEmail") {
      user = await User.findOne({ pendingEmail: normalizedEmail });
  } else {
      user = await User.findOne({ email: normalizedEmail });
  }

  if (!user && purpose !== "register") return { ok: false, msg: "User not found" };

  return { ok: true, user };
};

/**
 * Unified verification for Registration and Email Changes
 */
export const verifyUniversalOtp = async (email, otp, explicitPurpose) => {
  let purpose = explicitPurpose || "register";
  
  if (!explicitPurpose) {
    // Fallback: Check if it's an email change
    const existingUserWithPending = await User.findOne({ pendingEmail: email });
    if (existingUserWithPending) {
      purpose = "changeEmail";
    }
  }

  const result = await verifyOtp({ email, otp, purpose });
  if (!result.ok) throw new Error(result.msg);
  console.log("the otp is okay")
  if (purpose === "changeEmail") {
    const user = result.user;
    user.email = user.pendingEmail;
    user.pendingEmail = null;
    await user.save();
    return { type: "EMAIL_CHANGE", user };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const tempUser = await TempUser.findOne({ email: normalizedEmail });
  if (!tempUser) throw new Error("Session expired. Please register again.");

  // Resolve referral code to a referrer user ID (if provided)
  let referredById = null;
  if (tempUser.referralCode) {
      try {
          const referrer = await User.findOne({ referralCode: tempUser.referralCode }).select('_id').lean();
          if (referrer) referredById = referrer._id;
      } catch (_) {} // Non-fatal — proceed without referral
  }

  const newUser = await User.create({
      fullName: tempUser.fullName,
      email: tempUser.email,
      password: tempUser.password,
      isVerified: true,
      authProvider: "local",
      referredBy: referredById
  });

  await TempUser.deleteOne({ _id: tempUser._id });

  // ── Referral Reward: Credit both wallets immediately on verified signup ──
  if (referredById && referredById.toString() !== newUser._id.toString()) {
      try {
          await Promise.all([
              walletService.creditWallet(
                  referredById,
                  REFERRER_REWARD,
                  `Referral reward — ${newUser.fullName} joined SmartPick`,
                  'Referral'
              ),
              walletService.creditWallet(
                  newUser._id,
                  REFERRED_REWARD,
                  'Welcome bonus — Referral signup reward',
                  'Referral'
              )
          ]);
          // Mark reward as claimed so it won't fire again
          await newUser.updateOne({ referralRewardClaimed: true });
      } catch (err) {
          console.error('Referral wallet credit failed (non-fatal):', err);
      }
  }

  return { type: "REGISTRATION", user: newUser };
};

/**
 * Resend Logic (Infers purpose by finding which model matches)
 */
export const resendAnyOtp = async (email, explicitPurpose = null) => {
  if (!email) throw new Error("Email is required");
  const normalizedEmail = email.trim().toLowerCase();
  let target = await User.findOne({ pendingEmail: normalizedEmail }) || await TempUser.findOne({ email: normalizedEmail });
  let purpose = explicitPurpose;
  
  if (!purpose) {
      if (await User.findOne({ pendingEmail: email })) purpose = "changeEmail";
      else if (await TempUser.findOne({ email })) purpose = "register";
      else purpose = "reset_password"; 
  }

  if (!target) {
    const user = await User.findOne({ email });
    if (user) target = user;
  }

  // For reset password, `target` is the user. We just want to ensure user exists
  if (!target) throw new Error("Session expired.");

  // Check if current OTP is still valid
  const existingOtp = await Otp.findOne({ email, purpose });
  if (existingOtp) {
     const diff = Math.floor((new Date(existingOtp.createdAt).getTime() + 120000 - Date.now()) / 1000);
     if (diff > 0) throw new Error("Please wait for your previous OTP to expire before requesting a new one.");
  }

  // Delete old OTP if expired but still in DB
  await Otp.deleteMany({ email, purpose });

  const otp = genOtp();
  console.log(otp);

  await Otp.create({ email, otp, purpose });
  await sendOtpEmail(email, otp);
  
  return await getRemainingSeconds(email, purpose);
};

/**
 * Creates and sends a new OTP for any purpose
 */
export const sendOtp = async ({ email, purpose }) => {
  if (!email) throw new Error("Email is required");
  const normalizedEmail = email.trim().toLowerCase();
  if (purpose === "reset_password" || purpose === "changeEmail") {
      const field = purpose === "changeEmail" ? { pendingEmail: normalizedEmail } : { email: normalizedEmail };
      const user = await User.findOne(field);
      if (!user) throw new Error("User not found");
  } else if (purpose === "register") {
      const tempUser = await TempUser.findOne({ email: normalizedEmail });
      if (!tempUser) throw new Error("Session expired.");
  }

  // Remove existing OTPs for same email and purpose
  await Otp.deleteMany({ email: normalizedEmail, purpose });

  const otp = genOtp();
  console.log(otp)
  await Otp.create({ email: normalizedEmail, otp, purpose });

  await sendOtpEmail(email, otp);
  return { ok: true, email };
};
