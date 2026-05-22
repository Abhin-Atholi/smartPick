import * as userService from "../../services/user/user.service.js";

/**
 * GET: Load Account Overview
 */
export const loadAccount = async (req, res) => {
  try {
    const user = await userService.getUserById(req.session.userId);
    res.render("user/account/account", { title: "My Account", user, msg: req.query.msg || null });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

/**
 * PUT: Update Profile (Handles Image, Data, and Email Change/OTP via Axios)
 */
export const updateProfile = async (req, res) => {
  try {
    const result = await userService.processProfileUpdate(
      req.session.userId, 
      req.body, 
      req.file
    );

    // Update Session Data (Controller Concern)
    const user = result.user || await userService.getUserById(req.session.userId);
    req.session.user.fullName = user.fullName;
    req.session.user.profileImage = user.profileImage;

    // Handle Redirects based on Service outcome via JSON
    if (result.type === "VERIFY_OTP") {
      return res.status(200).json({ success: true, redirect: `/verify?email=${encodeURIComponent(result.email)}&context=changeEmail` });
    }

    req.session.save(() => res.status(200).json({ success: true, message: "Profile updated successfully ✅", user: { fullName: user.fullName, profileImage: user.profileImage } }));

  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * DELETE: Remove Profile Image (via JSON API)
 */
export const removeProfileImage = async (req, res) => {
  try {
    await userService.removeImage(req.session.userId);
    
    req.session.user.profileImage = null;
    req.session.save(() => res.status(200).json({ message: "Image removed" }));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

/**
 * GET: Load Addresses
 */
export const loadAddresses = async (req, res) => {
  try {
    const addresses = await userService.getAddressesByUserId(req.session.userId);

    // Read and immediately clear any flash data set by POST error handlers (PRG pattern)
    const flash = req.session.flash || {};
    delete req.session.flash;

    res.render("user/account/addresses", {
      title: "Saved Addresses",
      addresses: addresses || [],
      msg: null,
      modalError:      flash.modalError      || null,
      modalType:       flash.modalType       || null,
      editAddressData: flash.editAddressData || null,
      addAddressData:  flash.addAddressData  || null,
    });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

/**
 * POST: Add New Address (via Axios)
 */
export const addAddress = async (req, res) => {
  try {
    await userService.addAddress(req.session.userId, req.body);
    res.status(200).json({ success: true, message: "Address added successfully ✅" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message, addAddressData: req.body });
  }
};

/**
 * PUT: Update Existing Address (via Axios)
 */
export const updateAddress = async (req, res) => {
  try {
    await userService.updateAddress(req.session.userId, req.params.id, req.body);
    res.status(200).json({ success: true, message: "Address updated successfully ✅" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message, editAddressData: req.body });
  }
};

/**
 * DELETE: Remove Address (via Axios)
 */
export const deleteAddress = async (req, res) => {
  try {
    await userService.deleteAddress(req.session.userId, req.params.id);
    res.status(200).json({ success: true, message: "Address deleted successfully ✅" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * GET: Load Security Page
 */
export const loadSecurity = async (req, res) => {
  try {
    const user = await userService.getUserById(req.session.userId);
    res.render("user/account/security", { 
      title: "Account Security", 
      user, 
      msg: req.query.msg || null 
    });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

/**
 * PUT: Update Password (via Axios / AJAX)
 */
export const updatePassword = async (req, res) => {
  try {
    await userService.changePassword(req.session.userId, req.body);
    res.status(200).json({ success: true, message: "Password updated successfully ✅" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

