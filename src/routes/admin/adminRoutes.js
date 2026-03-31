import express from "express";
const router = express.Router();

// Import controller functions
import {
    getLogin,
    postLogin,
    getDashboard,
    getCustomers,
    toggleCustomerStatus,
    adminLogout
} from "../../controller/admin/adminController.js";

// Import middleware
import { isAdmin, redirectIfAdminAuth } from "../../middleware/admin/adminAuth.js";

// Import module routes
import categoryRoutes from "./categoryRoutes.js";
import subcategoryRoutes from "./subcategoryRoutes.js";
import productRoutes from "./productRoutes.js";

// --- Auth Routes ---
router.get("/login", redirectIfAdminAuth, getLogin);
router.post("/login", postLogin);

// --- Dashboard Route ---
router.get("/dashboard", isAdmin, getDashboard);

// --- Customer Management Routes ---
// 1. Route to display the customer listing (with search and filter)
router.get("/customers", isAdmin, getCustomers);

// 2. Route to handle the Block/Unblock toggle via POST/PATCH
router.post("/customers/toggle/:id", isAdmin, toggleCustomerStatus);

router.get("/logout", isAdmin, adminLogout);

// --- Category & Subcategory Modules ---
router.use("/category", categoryRoutes);
router.use("/subcategory", subcategoryRoutes);
router.use("/products", productRoutes);

export default router;