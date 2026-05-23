import express from "express";
const router = express.Router();

import {
    getLogin, postLogin,
    getCustomers, toggleCustomerStatus, adminLogout
} from "../../controllers/admin/admin.controller.js";

import { renderDashboard, getDashboardData } from "../../controllers/admin/dashboard.controller.js";
import { 
    getSalesReportsPage, 
    getSalesReportData, 
    exportExcelReport, 
    exportPdfReport,
    getRevenueSeriesData,
    getReturnAnalyticsData,
    getCouponAnalyticsData,
    getFullDashboardMetrics
} from "../../controllers/admin/report.controller.js";

import { isAdmin, redirectIfAdminAuth } from "../../middleware/admin/adminAuth.js";

import categoryRoutes from "./category.routes.js";
import subcategoryRoutes from "./subcategory.routes.js";
import productRoutes from "./product.routes.js";
import couponRoutes from "./coupon.routes.js";
import orderRoutes from "./order.routes.js";
import offerRoutes from "./offer.routes.js";
import bannerRoutes from "./banner.routes.js";
// --- Auth ---
router.get("/login", redirectIfAdminAuth, getLogin);
router.post("/login", postLogin);

// Apply isAdmin globally for all routes below
router.use(isAdmin);

// --- Dashboard ---
router.get("/dashboard", renderDashboard);
router.get("/dashboard/data", getDashboardData);

// --- Sales Reports ---
router.get("/sales-reports", getSalesReportsPage);
router.get("/sales-reports/data", getSalesReportData);
router.get("/sales-reports/export/excel", exportExcelReport);
router.get("/sales-reports/export/pdf", exportPdfReport);

// --- Phase 8: Analytics API ---
router.get("/analytics/dashboard", getFullDashboardMetrics);
router.get("/analytics/revenue-series", getRevenueSeriesData);
router.get("/analytics/returns", getReturnAnalyticsData);
router.get("/analytics/coupons", getCouponAnalyticsData);

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
router.use("/banners", bannerRoutes);

// --- Order Management ---
router.use("/orders", orderRoutes);

// --- 404 Fallback (must be last) ---
router.use((req, res) => {
  res.status(404).render("admin/error/404", {
    title: "Page Not Found — Admin | SmartPick"
  });
});

export default router;

