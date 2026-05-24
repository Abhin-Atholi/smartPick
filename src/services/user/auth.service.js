import bcrypt from "bcrypt";
import User from "../../model/userModel.js";
import TempUser from "../../model/tempUserModel.js";
import * as otpService from "../common/otp.service.js";
import { validateReferralCode } from "../../utils/referralHelper.js";
import { registerSchema, loginSchema, resetPasswordSchema } from "../../validators/user/authValidation.js";
import AppError from "../../utils/AppError.js";

/**
 * Register: Handles temporary user creation and OTP generation
 */
export const register = async (data) => {
  const { error, value } = registerSchema.validate(data);
  if (error) throw new AppError(error.details[0].message, 400);

  let { name, email, password, referralCode } = value;

  const existing = await User.findOne({ email });
  if (existing) throw new AppError("User already exists", 400);

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
  if (error) throw new AppError(error.details[0].message, 400);
  
  let { email, password } = value;

  const user = await User.findOne({ email });
  if (!user) throw new AppError("No user found, please register first", 400);
  
  // Inside your login function
  if (user.role !== 'user') {
    throw new AppError("Admins must login through the admin portal.", 400);
  }

  if (user.status === "blocked") throw new AppError("Your account has been suspended.", 400);

  // Security: Check for missing passwords (OAuth users or corrupted records)
  if (!user.password) {
    if (user.authProvider === "google") {
      throw new AppError("Please use 'Continue with Google' to login.", 400);
    }
    throw new AppError("Account has no password set. Please reset your password.", 400);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new AppError("Invalid email or password", 400);

  if (!user.isVerified) {
    throw new AppError("Please verify your account", 400, {
      needsVerify: true, // Controller uses this to redirect
      email: user.email
    });
  }

  return user;
};

/**
 * Finalize Password Reset: Hashing new password after OTP success
 */
export const finalizePasswordReset = async (data) => {
  if (!data.otp) throw new AppError("Please enter the otp", 400);
  
  const { error, value } = resetPasswordSchema.validate(data);
  if (error) throw new AppError(error.details[0].message, 400);

  const { email, otp, password } = value;

  const result = await otpService.verifyOtp({ email, otp, purpose: "reset_password" });
  
  if (!result.ok) throw new AppError(result.msg, 400);

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
