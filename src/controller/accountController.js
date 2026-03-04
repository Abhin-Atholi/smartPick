import User from "../model/userModel.js";
import { sendOtpEmail } from "../services/emailService.js";
import fs from "fs";
import path from "path";
import bcrypt from "bcrypt"


export const loadAccount = async (req, res) => {
  const user = await User.findById(req.session.userId);
  return res.render("user/account", {
    title: "My Account",
    user,
    msg: null,
  });
};

export const updateProfile = async (req, res) => {
  try {
    const { fullName, email, phone } = req.body;
    const userId = req.session.userId;
    const user = await User.findById(userId);

    // 1. HANDLE IMAGE UPLOAD (Logic remains same...)
    if (req.file) {
      if (user.profileImage) {
        const oldImagePath = path.join(process.cwd(), "src", "public", user.profileImage);
        if (fs.existsSync(oldImagePath)) fs.unlinkSync(oldImagePath);
      }
      user.profileImage = `/uploads/profiles/${req.file.filename}`;
    }

    // 2. EMAIL CHANGE LOGIC
    if (email !== user.email) {
      // 🔥 NEW GUARD: Check if Google User has set a password yet
      if (!user.password) {
        return res.redirect("/account/security?msg=Please set an account password before changing your email for security.");
      }

      const emailExists = await User.findOne({ email, _id: { $ne: userId } });
      if (emailExists) {
        return res.render("user/account", { title: "My Account", user, msg: "Email already taken" });
      }

      // Prepare OTP logic...
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.otp = otp;
      user.otpExpires = new Date(Date.now() + 3 * 60 * 1000);
      user.pendingEmail = email;
      user.fullName = fullName;
      user.phone = phone;

      await user.save();
      await sendOtpEmail(email, otp);

      req.session.user.fullName = user.fullName;
      req.session.user.profileImage = user.profileImage;

      return res.redirect(`/verify?email=${encodeURIComponent(email)}&context=changeEmail`);
    }

    // 3. NORMAL UPDATE (No email change)
    user.fullName = fullName;
    user.phone = phone;
    await user.save();

    req.session.user.fullName = user.fullName;
    req.session.user.phone = user.phone;
    req.session.user.profileImage = user.profileImage;

    req.session.save(() => res.redirect("/account?msg=Profile updated successfully ✅"));

  } catch (err) {
    console.error("Update Profile Error:", err);
    return res.status(500).send("Server Error");
  }
};

export const removeProfileImage = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    
    if (user.profileImage) {
      // 1. Delete the physical file
      const imagePath = path.join(process.cwd(), "src", "public", user.profileImage);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
      
      // 2. Clear from Database
      user.profileImage = null;
      await user.save();
      
      // 3. Update Session
      req.session.user.profileImage = null;
      req.session.save(() => {
        return res.status(200).json({ message: "Image removed" });
      });
    } else {
      res.status(400).json({ message: "No image to remove" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};



export const loadAddresses = async (req, res) => {
  const user = await User.findById(req.session.userId).select("addresses");
  return res.render("user/addresses", {
    title: "Saved Addresses",
    addresses: user?.addresses || [],
    msg: null,
  });
};

export const addAddress = async (req, res) => {
  try {
    const { fullName, phone, pincode, state, city, locality, house, area } = req.body;

    if (!fullName || !phone || !pincode || !state || !city || !locality || !house || !area) {
      const user = await User.findById(req.session.userId).select("addresses");
      return res.render("user/addresses", {
        title: "Saved Addresses",
        addresses: user?.addresses || [],
        msg: "All fields are required",
      });
    }

    await User.updateOne(
      { _id: req.session.userId },
      { $push: { addresses: { fullName, phone, pincode, state, city, locality, house, area } } }
    );

    return res.redirect("/account/addresses");
  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};

export const loadEditAddress = async (req, res) => {
  const user = await User.findById(req.session.userId).select("addresses");
  const address = user?.addresses?.id(req.params.id);

  if (!address) return res.redirect("/account/addresses");

  return res.render("user/edit-address", {
    title: "Edit Address",
    address,
    msg: null,
  });
};

export const updateAddress = async (req, res) => {
  try {
    const { fullName, phone, pincode, state, city, locality, house, area } = req.body;

    if (!fullName || !phone || !pincode || !state || !city || !locality || !house || !area) {
      return res.render("user/edit-address", {
        title: "Edit Address",
        address: { _id: req.params.id, ...req.body },
        msg: "All fields are required",
      });
    }

    await User.updateOne(
      { _id: req.session.userId, "addresses._id": req.params.id },
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

    return res.redirect("/account/addresses");
  } catch (err) {
    console.log(err);
    return res.status(500).send("Server Error");
  }
};

export const deleteAddress = async (req, res) => {
  await User.updateOne(
    { _id: req.session.userId },
    { $pull: { addresses: { _id: req.params.id } } }
  );

  return res.redirect("/account/addresses");
};

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

export const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    const user = await User.findById(req.session.userId);

    // If user has a password (Normal User), they must provide the current one
    if (user.password) {
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.render("user/security", { title: "Security", user, msg: "Current password is incorrect" });
      }
    }

    if (newPassword !== confirmPassword) {
      return res.render("user/security", { title: "Security", user, msg: "Passwords do not match" });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.redirect("/account/security?msg=Password updated successfully ✅");
  } catch (err) {
    res.status(500).send("Server Error");
  }
};




