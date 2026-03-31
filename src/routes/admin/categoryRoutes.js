import express from "express";
const router = express.Router();

import { isAdmin } from "../../middleware/admin/adminAuth.js";
import * as categoryController from "../../controller/admin/categoryController.js";
import { createCloudinaryUpload } from "../../config/multer.js";

const uploadCategory = createCloudinaryUpload('smartpick/categories');

// Protect all routes in this file
router.use(isAdmin); 

router.get("/", categoryController.getCategories);
router.post("/add", uploadCategory.single("image"), categoryController.addCategory);

router.get("/edit/:id", categoryController.getEditCategory);
router.put("/edit/:id", uploadCategory.single("image"), categoryController.updateCategory);
router.patch("/toggle/:id", categoryController.toggleCategory);
router.delete("/delete/:id", categoryController.deleteCategory);

export default router;
