// src/services/otpService.js
const User = require("../model/userModel");
const { sendOtpEmail } = require("./emailService");

const genOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const getWaitSeconds = (lastSentAt) => {
  if (!lastSentAt) return 0;
  const diffSec = Math.floor((Date.now() - new Date(lastSentAt).getTime()) / 1000);
  return diffSec < 60 ? 60 - diffSec : 0;
};

const sendVerifyOtpByUserId = async (userId) => {
  const user = await User.findById(userId).select("email isVerified");
  if (!user) return { ok: false, msg: "User not found" };
  if (user.isVerified) return { ok: false, msg: "Already verified" };

  const otp = genOtp();

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        otp,
        otpExpires: new Date(Date.now() + 10 * 60 * 1000),
        otpLastSentAt: new Date(),
        isVerified: false,
      },
    }
  );

  await sendOtpEmail(user.email, otp);
  return { ok: true, email: user.email, waitSeconds: 60 };
};

const resendVerifyOtpByEmail = async (email) => {
  const user = await User.findOne({ email }).select("email isVerified otpLastSentAt");
  if (!user) return { ok: false, msg: "User not found" };
  if (user.isVerified) return { ok: false, msg: "Already verified" };

  const waitSeconds = getWaitSeconds(user.otpLastSentAt);
  if (waitSeconds > 0) {
    return { ok: false, msg: `Please wait ${waitSeconds}s before resending OTP.`, waitSeconds, email };
  }

  const otp = genOtp();

  await User.updateOne(
    { email },
    {
      $set: {
        otp,
        otpExpires: new Date(Date.now() + 10 * 60 * 1000),
        otpLastSentAt: new Date(),
      },
    }
  );

  await sendOtpEmail(email, otp);
  return { ok: true, msg: "OTP sent again ✅", waitSeconds: 60, email };
};

module.exports = { sendVerifyOtpByUserId, resendVerifyOtpByEmail, getWaitSeconds };
