import * as userService from "../../services/user/user.service.js"; // Ensure this filename is correct

import * as productService from "../../services/user/product.service.js";
import * as offerHelper from "../../utils/offerHelper.js";
import Banner from "../../model/bannerModel.js";

export const loadHome = async (req, res) => {
  try {
    const { categories, latestProducts } = await productService.getHomeData();

    // Enrich latest products with offers
    const enrichedProducts = await offerHelper.applyOffersToProducts(latestProducts);

    // Fetch active banner
    const activeBanner = await Banner.findOne({ isActive: true });

    res.render("user/home/home", { 
      title: "SmartPick | Premium Fashion", 
      categories, 
      latestProducts: enrichedProducts,
      activeBanner
    });
  } catch (error) {
    if (!error.isOperational) console.error("Home load error:", error);
    res.render("user/home/home", { title: "SmartPick", categories: [], latestProducts: [], activeBanner: null });
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
      if (err) if (!err.isOperational) console.error("Passport logout error:", err);

      // Restore admin session
      if (adminId && adminData) {
        req.session.adminId = adminId;
        req.session.admin = adminData;
      }

      req.session.save((err) => {
        if (err) if (!err.isOperational) console.error("Logout error:", err);
        res.redirect("/login");
      });
    });
  } else {
    req.session.save((err) => {
      if (err) if (!err.isOperational) console.error("Logout error:", err);
      res.redirect("/login");
    });
  }
};





