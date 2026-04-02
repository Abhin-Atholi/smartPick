import * as userService from "../../services/user/userService.js"; // Ensure this filename is correct

import Category from "../../model/categoryModel.js";
import Product from "../../model/productModel.js";

export const loadHome = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).lean();
    
    // Latest Products (limit 12)
    const latestProducts = await Product.find({
      isActive: true,
      isDeleted: false
    })
    .populate('category', 'name')
    .sort({ createdAt: -1 })
    .limit(12)
    .lean();

    res.render("user/home", { 
      title: "SmartPick | Premium Fashion", 
      categories, 
      latestProducts 
    });
  } catch (error) {
    console.error("Home load error:", error);
    res.render("user/home", { title: "SmartPick", categories: [], latestProducts: [] });
  }
};

export const logout = (req, res) => {
  req.session.user = null;
  req.session.userId = null;

  // Backup admin data since req.logout regenerates/destroys the session
  const adminId = req.session.adminId;
  const adminData = req.session.admin;

  if (req.user) {
    req.logout({ keepSessionInfo: true }, (err) => {
      if (err) console.error("Passport logout error:", err);

      // Restore admin session
      if (adminId && adminData) {
        req.session.adminId = adminId;
        req.session.admin = adminData;
      }

      req.session.save((err) => {
        if (err) console.error("Logout error:", err);
        res.redirect("/");
      });
    });
  } else {
    req.session.save((err) => {
      if (err) console.error("Logout error:", err);
      res.redirect("/");
    });
  }
};



