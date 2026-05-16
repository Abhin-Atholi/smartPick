import User from "../../model/userModel.js";
import bcrypt from "bcrypt";
import { deleteLocalFile, deleteCloudinaryFile } from "../../utils/fileHelper.js";
import * as otpService from "../common/otpService.js";
import Address from "../../model/addressModel.js";
import { addressSchema } from "../../validators/user/addressValidation.js";

/**
 * Logic: Process Profile Updates, handle image replacement, and email change security.
 */
export const processProfileUpdate = async (userId, updateData, file) => {
  const { fullName, email, phone } = updateData;
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // Handle Image Replacement
  if (file) {
    // If user already had a Cloudinary image, delete it
    if (user.profileImageId) {
      await deleteCloudinaryFile(user.profileImageId);
    } else if (user.profileImage) {
      // Legacy fallback
      deleteLocalFile(user.profileImage);
    }
    
    // multer-storage-cloudinary provides URL in `path` and public_id in `filename`
    user.profileImage = file.path;
    user.profileImageId = file.filename;
  }

  // Handle Email Change Security & OTP
  const normalizedEmail = email ? email.trim().toLowerCase() : email;
  if (normalizedEmail && normalizedEmail !== user.email) {
    if (user.authProvider === 'google') {
      throw new Error("Email cannot be changed for Google accounts.");
    }

    const emailExists = await User.findOne({ email: normalizedEmail, _id: { $ne: userId } });
    if (emailExists) throw new Error("Email already taken");

    user.pendingEmail = normalizedEmail;
    
    user.fullName = fullName || user.fullName;
    user.phone = phone || user.phone;
    await user.save();
    
    await otpService.sendOtp({ email: normalizedEmail, purpose: "changeEmail" });
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
  if (!user || (!user.profileImage && !user.profileImageId)) throw new Error("No image to remove");

  if (user.authProvider === 'google') {
    throw new Error("Profile image is managed via Google Account.");
  }

  if (user.profileImageId) {
    await deleteCloudinaryFile(user.profileImageId);
  } else if (user.profileImage) {
    deleteLocalFile(user.profileImage);
  }
  
  user.profileImage = null;
  user.profileImageId = null;
  await user.save();
};

/**
 * Logic: Manage Addresses (Push, Set, Pull)
 */
export const addAddress = async (userId, addressData) => {
  const { error, value } = addressSchema.validate(addressData, { abortEarly: false, stripUnknown: true });
  if (error) throw new Error(error.details[0].message);

  let defaultStatus = value.isDefault === true;

  const existingAddresses = await Address.countDocuments({ userId });
  if (existingAddresses === 0) {
    defaultStatus = true;
  } else if (defaultStatus) {
    await Address.updateMany({ userId }, { $set: { isDefault: false } });
  }

  return await Address.create({ userId, ...value, isDefault: defaultStatus });
};

export const updateAddress = async (userId, addressId, addressData) => {
  const { error, value } = addressSchema.validate(addressData, { abortEarly: false, stripUnknown: true });
  if (error) throw new Error(error.details[0].message);

  const defaultStatus = value.isDefault === true;

  if (defaultStatus) {
    await Address.updateMany({ userId, _id: { $ne: addressId } }, { $set: { isDefault: false } });
  }

  const { isDefault: _ignored, ...fields } = value;
  return await Address.findOneAndUpdate(
    { _id: addressId, userId },
    { $set: { ...fields, isDefault: defaultStatus } },
    { new: true }
  );
};

export const deleteAddress = async (userId, addressId) => {
  return await Address.findOneAndDelete({ _id: addressId, userId });
};

/**
 * Logic: Secure Password Hashing and Comparison
 */
export const changePassword = async (userId, { currentPassword, newPassword, confirmPassword }) => {
  const user = await User.findById(userId);
  
  if (user.authProvider === 'google') {
    throw new Error("Password cannot be changed for Google accounts.");
  }

  // Local users must provide correct current password
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) throw new Error("Current password is incorrect");

  if (newPassword !== confirmPassword) throw new Error("Passwords do not match");

  user.password = await bcrypt.hash(newPassword, 12);
  await user.save();
};

export const getUserById = async (userId) => {
    return await User.findById(userId);
};

export const getAddressesByUserId = async (userId) => {
    return await Address.find({ userId });
};

export const getAddressById = async (addressId, userId) => {
    return await Address.findOne({ _id: addressId, userId });
};