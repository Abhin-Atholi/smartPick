import express from "express";
const router = express.Router();

import { isAdmin } from "../../middleware/admin/adminAuth.js";
import * as subcategoryController from "../../controller/admin/subcategoryController.js";

// Protect all routes in this file
router.use(isAdmin);

// All routes are implicitly prefixed with "/admin/subcategories"
router.get("/", subcategoryController.getSubcategories);
router.get("/add", subcategoryController.getAddSubcategory);
router.post("/add", subcategoryController.addSubcategory);
router.get("/edit/:id", subcategoryController.getEditSubcategory);
router.put("/edit/:id", subcategoryController.updateSubcategory);
router.delete("/delete/:id", subcategoryController.deleteSubcategory);

export default router;
