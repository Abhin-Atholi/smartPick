import express from "express";
const router = express.Router();

import { isAdmin } from "../../middleware/admin/adminAuth.js";
import * as subcategoryController from "../../controller/admin/subcategoryController.js";

import { createCloudinaryUpload, handleUploadError } from "../../config/multer.js";

const uploadSubcategory = createCloudinaryUpload('smartpick/subcategories');

// Protect all routes in this file
router.use(isAdmin);

// All routes are implicitly prefixed with "/admin/subcategory"
router.get("/", subcategoryController.getSubcategories);

router.post("/add", uploadSubcategory.single("image"), handleUploadError, subcategoryController.addSubcategory);

router.put("/edit/:id", uploadSubcategory.single("image"), handleUploadError, subcategoryController.updateSubcategory);
router.patch("/toggle/:id", subcategoryController.toggleSubcategory);

export default router;
