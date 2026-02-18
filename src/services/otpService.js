// src/services/otpService.js
const User = require("../model/userModel");
const { sendOtpEmail } = require("./emailService");

const genOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const getWaitSeconds = (lastSentAt) => {
  if (!lastSentAt) return 0;
  const diffSec = Math.floor((Date.now() - new Date(lastSentAt).getTime()) / 1000);
  return diffSec < 60 ? 60 - diffSec : 0;
};

// Send OTP for a purpose (verify/reset_password)
const sendOtp = async ({ email, userId, purpose }) => {
  if (!purpose) return { ok: false, msg: "OTP purpose is required" };

  const user = userId
    ? await User.findById(userId).select("email isVerified otpLastSentAt")
    : await User.findOne({ email }).select("email isVerified otpLastSentAt");

  if (!user) return { ok: false, msg: "User not found" };

  // purpose rules
  if (purpose === "verify" && user.isVerified) {
    return { ok: false, msg: "Already verified" };
  }

  // 60 sec limit
  const waitSeconds = getWaitSeconds(user.otpLastSentAt);
  if (waitSeconds > 0) {
    return { ok: false, msg: `Please wait ${waitSeconds}s before resending OTP.`, waitSeconds, email: user.email };
  }

  const otp = genOtp();

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        otp,
        otpPurpose: purpose,
        otpExpires: new Date(Date.now() + 10 * 60 * 1000),
        otpLastSentAt: new Date(),
      },
    }
  );

  await sendOtpEmail(user.email, otp);

  return { ok: true, email: user.email, waitSeconds: 60 };
};

// Verify OTP for a purpose
const verifyOtp = async ({ email, otp, purpose }) => {
  if (!email || !otp || !purpose) {
    return { ok: false, msg: "Missing fields" };
  }

  const user = await User.findOne({ email });
  if (!user) return { ok: false, msg: "User not found" };

  if (!user.otp || !user.otpExpires || !user.otpPurpose) {
    return { ok: false, msg: "OTP not found. Please request again." };
  }

  if (user.otpPurpose !== purpose) {
    return { ok: false, msg: "OTP purpose mismatch. Please request again." };
  }

  if (user.otpExpires < new Date()) {
    return { ok: false, msg: "OTP expired. Please request again." };
  }

  if (user.otp !== otp) {
    return { ok: false, msg: "Invalid OTP", waitSeconds: getWaitSeconds(user.otpLastSentAt) };
  }

  // success — clear OTP
  user.otp = null;
  user.otpPurpose = null;
  user.otpExpires = null;
  user.otpLastSentAt = null;
  await user.save();

  return { ok: true, user };
};

module.exports = { sendOtp, verifyOtp, getWaitSeconds };
