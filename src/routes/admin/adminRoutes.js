import express from "express";
const router = express.Router();

import {
    getLogin, postLogin, getDashboard,
    getCustomers, toggleCustomerStatus, adminLogout
} from "../../controller/admin/adminController.js";

import { isAdmin, redirectIfAdminAuth } from "../../middleware/admin/adminAuth.js";

import categoryRoutes from "./categoryRoutes.js";
import subcategoryRoutes from "./subcategoryRoutes.js";
import productRoutes from "./productRoutes.js";
import couponRoutes from "./couponRoutes.js";
import orderRoutes from "./orderRoutes.js";
import offerRoutes from "./offerRoutes.js";
// --- Auth ---
router.get("/login", redirectIfAdminAuth, getLogin);
router.post("/login", postLogin);

// Apply isAdmin globally for all routes below
router.use(isAdmin);

// --- Dashboard ---
router.get("/dashboard", getDashboard);

// --- Customers ---
router.get("/customers", getCustomers);
router.post("/customers/toggle/:id", toggleCustomerStatus);

router.get("/logout", adminLogout);

// --- Category / Subcategory / Products / Coupons ---
router.use("/category", categoryRoutes);
router.use("/subcategory", subcategoryRoutes);
router.use("/products", productRoutes);
router.use("/coupons", couponRoutes);
router.use("/offers", offerRoutes);

// --- Order Management ---
router.use("/orders", orderRoutes);

export default router;
