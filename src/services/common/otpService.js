import User from "../../model/userModel.js";
import TempUser from "../../model/tempUserModel.js";
import Otp from "../../model/otpModel.js";
import { sendOtpEmail } from "./emailService.js";

const genOtp = () => Math.floor(100000 + Math.random() * 900000).toString();


export const getRemainingSeconds = async (email, purpose) => {
  const otpRecord = await Otp.findOne({ email, purpose });
  if (!otpRecord) return 0;
  
  // Model TTL is 120s (2 minutes)
  const expiresAt = new Date(otpRecord.createdAt).getTime() + 120000;
  const diff = Math.floor((expiresAt - Date.now()) / 1000);
  return Math.max(0, diff);
};

// Unified function to find a target for verification (used by loadVerify)
export const getVerificationTarget = async (email, context) => {
  let target;
  if (context === "changeEmail") {
    target = await User.findOne({ pendingEmail: email });
  } else if (context === "resetPassword") {
    target = await User.findOne({ email });
  } else {
    // register context
    target = await TempUser.findOne({ email });
  }
  
  if (!target) throw new Error("Session expired. Please start over.");
  return target;
};

export const verifyOtp = async ({ email, otp, purpose }) => {
  const otpRecord = await Otp.findOne({ email, purpose });
  if (!otpRecord) return { ok: false, msg: "OTP expired or invalid" };

  if (otpRecord.otp !== otp) return { ok: false, msg: "Invalid OTP" };

  // Validated! Delete the OTP
  await Otp.deleteOne({ _id: otpRecord._id });

  let user;
  if (purpose === "changeEmail") {
      user = await User.findOne({ pendingEmail: email });
  } else {
      user = await User.findOne({ email });
  }

  if (!user && purpose !== "register") return { ok: false, msg: "User not found" };

  return { ok: true, user };
};

/**
 * Unified verification for Registration and Email Changes
 */
export const verifyUniversalOtp = async (email, otp) => {
  let purpose = "register";
  
  // Check if it's an email change
  const existingUserWithPending = await User.findOne({ pendingEmail: email });
  if (existingUserWithPending) {
    purpose = "changeEmail";
  }

  const result = await verifyOtp({ email, otp, purpose });
  if (!result.ok) throw new Error(result.msg);

  if (purpose === "changeEmail") {
    const user = result.user;
    user.email = user.pendingEmail;
    user.pendingEmail = null;
    await user.save();
    return { type: "EMAIL_CHANGE", user };
  }

  // Fallback to Registration (TempUser)
  const tempUser = await TempUser.findOne({ email });
  if (!tempUser) throw new Error("Session expired.");

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
 * Resend Logic (Infers purpose by finding which model matches)
 */
export const resendAnyOtp = async (email, explicitPurpose = null) => {
  let target = await User.findOne({ pendingEmail: email }) || await TempUser.findOne({ email });
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
  if (purpose === "reset_password" || purpose === "changeEmail") {
      const field = purpose === "changeEmail" ? { pendingEmail: email } : { email };
      const user = await User.findOne(field);
      if (!user) throw new Error("User not found");
  } else if (purpose === "register") {
      const tempUser = await TempUser.findOne({ email });
      if (!tempUser) throw new Error("Session expired.");
  }

  // Remove existing OTPs for same email and purpose
  await Otp.deleteMany({ email, purpose });

  const otp = genOtp();
  console.log(otp)
  await Otp.create({ email, otp, purpose });

  await sendOtpEmail(email, otp);
  return { ok: true, email };
};
