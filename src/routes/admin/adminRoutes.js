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
import * as orderController from "../../controller/admin/orderController.js";

// --- Auth ---
router.get("/login", redirectIfAdminAuth, getLogin);
router.post("/login", postLogin);

// --- Dashboard ---
router.get("/dashboard", isAdmin, getDashboard);

// --- Customers ---
router.get("/customers", isAdmin, getCustomers);
router.post("/customers/toggle/:id", isAdmin, toggleCustomerStatus);

router.get("/logout", isAdmin, adminLogout);

// --- Category / Subcategory / Products ---
router.use("/category", categoryRoutes);
router.use("/subcategory", subcategoryRoutes);
router.use("/products", productRoutes);

// --- Order Management ---
router.get("/orders",                              isAdmin, orderController.getOrders);
router.get("/orders/return-requests",              isAdmin, orderController.getReturnRequests);
router.get("/orders/:id",                          isAdmin, orderController.getOrderDetails);
router.patch("/orders/:id/status",                 isAdmin, orderController.updateStatus);
router.patch("/orders/:id/cancel-item",            isAdmin, orderController.cancelItem);
router.post("/orders/:id/return-decision",         isAdmin, orderController.handleReturn);
router.get("/orders/:id/view-invoice",             isAdmin, orderController.viewInvoice);
router.get("/orders/:id/download-invoice",         isAdmin, orderController.downloadInvoice);

export default router;
