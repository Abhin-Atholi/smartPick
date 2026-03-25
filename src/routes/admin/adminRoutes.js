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
import { isAdmin, redirectIfAdminAuth } from "../../middleware/adminAuth.js";

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

export default router;