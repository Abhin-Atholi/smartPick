import express from "express";
const router = express.Router();

// Ensure these names match your adminController.js exports exactly
import { getLogin, postLogin, getDashboard } from "../controller/adminController.js";
import { isAdmin, redirectIfAdminAuth } from "../middleware/adminAuth.js";

// Routes
router.get("/login", redirectIfAdminAuth, getLogin);
router.post("/login", postLogin);
router.get("/dashboard", isAdmin, getDashboard);

export default router;