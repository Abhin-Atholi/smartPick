import * as userService from "../../services/user/userService.js"; // Ensure this filename is correct

import * as productService from "../../services/user/productService.js";

export const loadHome = async (req, res) => {
  try {
    const { categories, latestProducts } = await productService.getHomeData();

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



