import bcrypt from "bcrypt";
import User from "../../model/userModel.js";
import TempUser from "../../model/tempUserModel.js";
import * as otpService from "../common/otp.service.js";
import { validateReferralCode } from "../../utils/referralHelper.js";
import { registerSchema, loginSchema, resetPasswordSchema } from "../../validators/user/authValidation.js";

/**
 * Register: Handles temporary user creation and OTP generation
 */
export const register = async (data) => {
  const { error, value } = registerSchema.validate(data);
  if (error) throw new Error(error.details[0].message);

  let { name, email, password, referralCode } = value;

  const existing = await User.findOne({ email });
  if (existing) throw new Error("User already exists");

  const hashedPassword = await bcrypt.hash(password, 12);
  await TempUser.findOneAndUpdate(
    { email },
    {
      fullName: name,
      email,
      password: hashedPassword,
      referralCode: referralCode ? referralCode.toUpperCase().trim() : null
    },
    { upsert: true, new: true }
  );

  await otpService.sendOtp({ email, purpose: "register" });

  return { email }; 
};

/**
 * Login: Handles credentials, block status, and verification checks
 */
export const login = async (data) => {
  const { error, value } = loginSchema.validate(data);
  if (error) throw new Error(error.details[0].message);
  
  let { email, password } = value;

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
  if (!isMatch) throw new Error("Invalid email or password");

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
export const finalizePasswordReset = async (data) => {
  if (!data.otp) throw new Error("Please enter the otp");
  
  const { error, value } = resetPasswordSchema.validate(data);
  if (error) throw new Error(error.details[0].message);

  const { email, otp, password } = value;

  const result = await otpService.verifyOtp({ email, otp, purpose: "reset_password" });
  
  if (!result.ok) throw new Error(result.msg);

  // result.user is the Mongoose document returned by otpService
  const user = result.user;
  user.password = await bcrypt.hash(password, 12);

  await user.save();
};

export const checkEmail = async (email) => {
  if (!email) return false;
  email = email.trim().toLowerCase();
  const existing = await User.findOne({ email });
  return !existing;
};
