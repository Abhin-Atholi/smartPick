import express from "express";
const router = express.Router();

import { isAdmin } from "../../middleware/admin/adminAuth.js";
import * as productController from "../../controller/admin/productController.js";
import { createCloudinaryUpload, handleUploadError } from "../../config/multer.js";

const uploadProduct = createCloudinaryUpload('smartpick/products');

router.use(isAdmin);

// Listing
router.get("/", productController.getProducts);

// Add product
router.get("/add", productController.getAddProduct);
router.post("/add", uploadProduct.any(), handleUploadError, productController.addProduct);

// Edit product
router.get("/edit/:id", productController.getEditProduct);
router.put("/edit/:id", uploadProduct.any(), handleUploadError, productController.updateProduct);

// AJAX: fetch subcategories for a picked category
router.get("/subcategories/:categoryId", productController.getSubcategoriesByCategory);

// Toggle visibility / featured
router.patch("/toggle/:id", productController.toggleProduct);
router.patch("/featured/:id", productController.toggleFeatured);

// Soft delete
router.patch("/delete/:id", productController.softDeleteProduct);

export default router;
