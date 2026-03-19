import User from "../model/userModel.js";
import * as userService from "../services/userService.js";

/**
 * GET: Load Account Overview
 */
export const loadAccount = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    res.render("user/account", { title: "My Account", user, msg: null });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

/**
 * POST: Update Profile (Handles Image, Data, and Email Change/OTP)
 */
export const updateProfile = async (req, res) => {
  try {
    const result = await userService.processProfileUpdate(
      req.session.userId, 
      req.body, 
      req.file
    );

    // Update Session Data (Controller Concern)
    const user = result.user || await User.findById(req.session.userId);
    req.session.user.fullName = user.fullName;
    req.session.user.profileImage = user.profileImage;

    // Handle Redirects based on Service outcome
    if (result.type === "VERIFY_OTP") {
      return res.redirect(`/verify?email=${encodeURIComponent(result.email)}&context=changeEmail`);
    }

    req.session.save(() => res.redirect("/account?msg=Profile updated successfully ✅"));

  } catch (err) {
    const user = await User.findById(req.session.userId);
    res.render("user/account", { title: "My Account", user, msg: err.message });
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
    const user = await User.findById(req.session.userId).select("addresses");

    // Read and immediately clear any flash data set by POST error handlers (PRG pattern)
    const flash = req.session.flash || {};
    delete req.session.flash;

    res.render("user/addresses", {
      title: "Saved Addresses",
      addresses: user?.addresses || [],
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
 * POST: Add New Address
 */
export const addAddress = async (req, res) => {
  try {
    await userService.addAddress(req.session.userId, req.body);
    res.redirect("/account/addresses");

  } catch (err) {
    req.session.flash = { modalError: err.message, modalType: "add", addAddressData: req.body };
    return req.session.save(() => res.redirect("/account/addresses"));
  }
};

/**
 * GET: Load Edit Address Page
 */
export const loadEditAddress = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select("addresses");
    const address = user?.addresses?.id(req.params.id);

    if (!address) return res.redirect("/account/addresses");

    res.render("user/edit-address", { title: "Edit Address", address, msg: null });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

/**
 * POST: Update Existing Address
 */
export const updateAddress = async (req, res) => {
  try {
    await userService.updateAddress(req.session.userId, req.params.id, req.body);
    res.redirect("/account/addresses");
  } catch (err) {
    req.session.flash = {
      modalError: err.message,
      modalType: "edit",
      editAddressData: { _id: req.params.id, ...req.body },
    };
    return req.session.save(() => res.redirect("/account/addresses"));
  }
};

/**
 * POST/DELETE: Remove Address
 */
export const deleteAddress = async (req, res) => {
  try {
    await userService.deleteAddress(req.session.userId, req.params.id);
    res.redirect("/account/addresses");
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

/**
 * GET: Load Security Page
 */
export const loadSecurity = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    res.render("user/security", { 
      title: "Account Security", 
      user, 
      msg: req.query.msg || null 
    });
  } catch (err) {
    res.status(500).send("Server Error");
  }
};

/**
 * POST: Update Password
 */
export const updatePassword = async (req, res) => {
  try {
    await userService.changePassword(req.session.userId, req.body);
    res.redirect("/account/security?msg=Password updated successfully ✅");
  } catch (err) {
    const user = await User.findById(req.session.userId);
    res.render("user/security", { title: "Security", user, msg: err.message });
  }
};