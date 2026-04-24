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
import * as orderController from "../../controller/admin/orderController.js";

// --- Auth Routes ---
router.get("/login", redirectIfAdminAuth, getLogin);
router.post("/login", postLogin);

// --- Dashboard Route ---
router.get("/dashboard", isAdmin, getDashboard);

// --- Customer Management Routes ---
router.get("/customers", isAdmin, getCustomers);
router.post("/customers/toggle/:id", isAdmin, toggleCustomerStatus);

router.get("/logout", isAdmin, adminLogout);

// --- Category & Subcategory Modules ---
router.use("/category", categoryRoutes);
router.use("/subcategory", subcategoryRoutes);
router.use("/products", productRoutes);

// --- Order Management Routes ---
router.get("/orders", isAdmin, orderController.getOrders);
router.get("/orders/:id", isAdmin, orderController.getOrderDetails);
router.patch("/orders/:id/status", isAdmin, orderController.updateStatus);
router.get("/orders/:id/download-invoice", isAdmin, orderController.downloadInvoice);

export default router;
