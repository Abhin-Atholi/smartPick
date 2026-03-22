import User from "../model/userModel.js";
import bcrypt from "bcrypt";
import { sendOtpEmail } from "./emailService.js";
import { deleteLocalFile } from "../utils/fileHelper.js";

/**
 * Logic: Process Profile Updates, handle image replacement, and email change security.
 */
export const processProfileUpdate = async (userId, updateData, file) => {
  const { fullName, email, phone } = updateData;
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // Handle Image Replacement
  if (file) {
    if (user.profileImage) deleteLocalFile(user.profileImage);
    user.profileImage = `/uploads/profiles/${file.filename}`;
  }

  // Handle Email Change Security & OTP
  const normalizedEmail = email ? email.trim().toLowerCase() : email;
  if (normalizedEmail && normalizedEmail !== user.email) {
    if (!user.password) {
      throw new Error("Please set an account password before changing your email.");
    }

    const emailExists = await User.findOne({ email: normalizedEmail, _id: { $ne: userId } });
    if (emailExists) throw new Error("Email already taken");

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 2 * 60 * 1000);
    user.pendingEmail = normalizedEmail;
    
    user.fullName = fullName || user.fullName;
    user.phone = phone || user.phone;
    await user.save();
    
    await sendOtpEmail(normalizedEmail, otp);
    return { type: "VERIFY_OTP", email: normalizedEmail };
  }

  user.fullName = fullName || user.fullName;
  user.phone = phone || user.phone;
  await user.save();

  return { type: "SUCCESS", user };
};

/**
 * Logic: Delete profile image from both DB and Disk
 */
export const removeImage = async (userId) => {
  const user = await User.findById(userId);
  if (!user || !user.profileImage) throw new Error("No image to remove");

  deleteLocalFile(user.profileImage);
  user.profileImage = null;
  await user.save();
};

/**
 * Logic: Manage Addresses (Push, Set, Pull)
 */
export const addAddress = async (userId, addressData) => {
  const { fullName, phone, pincode, state, city, locality, house, area } = addressData;

  // Field-level validation (service concern)
  if (!fullName || fullName.trim().length < 3)
    throw new Error("Full name must be at least 3 characters.");
  if (!phone || !/^[6-9]\d{9}$/.test(phone))
    throw new Error("Enter a valid 10-digit Indian mobile number.");
  if (!pincode || !/^\d{6}$/.test(pincode))
    throw new Error("Pincode must be exactly 6 digits.");
  if (!state || state.trim().length < 2)
    throw new Error("Please enter a valid state.");
  if (!city || city.trim().length < 2)
    throw new Error("Please enter a valid city.");
  if (!locality || locality.trim().length < 2)
    throw new Error("Please enter a valid locality.");
  if (!house || house.trim().length < 3)
    throw new Error("House / Building field must be at least 3 characters.");
  if (!area || area.trim().length < 3)
    throw new Error("Area / Street must be at least 3 characters.");

  return await User.updateOne(
    { _id: userId },
    { $push: { addresses: addressData } }
  );
};

export const updateAddress = async (userId, addressId, addressData) => {
  const { fullName, phone, pincode, state, city, locality, house, area } = addressData;

  // Field-level validation (service concern)
  if (!fullName || fullName.trim().length < 3)
    throw new Error("Full name must be at least 3 characters.");
  if (!phone || !/^[6-9]\d{9}$/.test(phone))
    throw new Error("Enter a valid 10-digit Indian mobile number.");
  if (!pincode || !/^\d{6}$/.test(pincode))
    throw new Error("Pincode must be exactly 6 digits.");
  if (!state || state.trim().length < 2)
    throw new Error("Please enter a valid state.");
  if (!city || city.trim().length < 2)
    throw new Error("Please enter a valid city.");
  if (!locality || locality.trim().length < 2)
    throw new Error("Please enter a valid locality.");
  if (!house || house.trim().length < 3)
    throw new Error("House / Building field must be at least 3 characters.");
  if (!area || area.trim().length < 3)
    throw new Error("Area / Street must be at least 3 characters.");

  return await User.updateOne(
    { _id: userId, "addresses._id": addressId },
    {
      $set: {
        "addresses.$.fullName": fullName,
        "addresses.$.phone": phone,
        "addresses.$.pincode": pincode,
        "addresses.$.state": state,
        "addresses.$.city": city,
        "addresses.$.locality": locality,
        "addresses.$.house": house,
        "addresses.$.area": area,
      },
    }
  );
};

export const deleteAddress = async (userId, addressId) => {
  return await User.updateOne(
    { _id: userId },
    { $pull: { addresses: { _id: addressId } } }
  );
};

/**
 * Logic: Secure Password Hashing and Comparison
 */
export const changePassword = async (userId, { currentPassword, newPassword, confirmPassword }) => {
  const user = await User.findById(userId);
  
  if (user.password) {
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) throw new Error("Current password is incorrect");
  }

  if (newPassword !== confirmPassword) throw new Error("Passwords do not match");

  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();
};