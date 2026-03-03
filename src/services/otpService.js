import User from "../model/userModel.js";
import TempUser from "../model/tempUserModel.js"; // Import the new model
import { sendOtpEmail } from "./emailService.js";

const genOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

export const getWaitSeconds = (lastSentAt) => {
    if (!lastSentAt) return 0;
    const diffSec = Math.floor((Date.now() - new Date(lastSentAt).getTime()) / 1000);
    return diffSec < 60 ? 60 - diffSec : 0;
};

/**
 * NEW: Specifically for promoting TempUser to Permanent User
 */
export const verifyRegisterOtp = async ({ email, otp }) => {
    if (!email || !otp) return { ok: false, msg: "Email and OTP are required" };

    const tempUser = await TempUser.findOne({ email });

    if (!tempUser) {
        return { ok: false, msg: "Registration session expired. Please sign up again." };
    }

    if (tempUser.otp !== otp) {
        return { ok: false, msg: "Invalid OTP code." };
    }

    // Since it's a temp user, we don't need complicated purpose checks
    // If they have the OTP and the record hasn't been deleted by TTL, they are good.

    // SUCCESS: Move to permanent storage
    const newUser = await User.create({
        fullName: tempUser.fullName,
        email: tempUser.email,
        password: tempUser.password,
        isVerified: true,
        authProvider: "local"
    });

    // Cleanup the waiting room
    await TempUser.deleteOne({ _id: tempUser._id });

    return { ok: true, user: newUser };
};

/**
 * UPDATED: Handle OTPs for existing users (e.g., Reset Password)
 */
export const sendOtp = async ({ email, userId, purpose }) => {
    if (!purpose) return { ok: false, msg: "OTP purpose is required" };

    // Logic for existing users
    const user = userId
        ? await User.findById(userId)
        : await User.findOne({ email });

    if (!user) return { ok: false, msg: "User not found" };

    // 60-second flood protection
    const waitSeconds = getWaitSeconds(user.otpLastSentAt);
    if (waitSeconds > 0) {
        return { ok: false, msg: `Wait ${waitSeconds}s`, waitSeconds, email: user.email };
    }

    const otp = genOtp();

    await User.updateOne(
        { _id: user._id },
        {
            $set: {
                otp,
                otpPurpose: purpose,
                otpExpires: new Date(Date.now() + 3 * 60 * 1000),
                otpLastSentAt: new Date(),
            },
        }
    );

    await sendOtpEmail(user.email, otp);
    return { ok: true, email: user.email, waitSeconds: 60 };
};


// Verify OTP for a purpose
export const verifyOtp = async ({ email, otp, purpose }) => {
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

// Add this to your existing otpService.js
export const resendTempOtp = async (email) => {
    const tempUser = await TempUser.findOne({ email });
    if (!tempUser) return { ok: false, msg: "Session expired. Register again." };

    // 🔥 GUARD: Prevent resend if the 3 minutes haven't passed yet
    const now = new Date();
    const expiry = new Date(tempUser.otpExpires);
    
    if (now < expiry) {
        return { ok: false, msg: "Please wait for the current OTP to expire." };
    }

    // Generate new OTP and set new 3-minute expiry (180,000ms)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const threeMinutesFromNow = new Date(Date.now() + 3 * 60 * 1000);

    tempUser.otp = otp;
    tempUser.otpExpires = threeMinutesFromNow; 
    await tempUser.save();

    await sendOtpEmail(email, otp);
    return { ok: true, email };
};
