import express from "express";
const router = express.Router();

import { isAdmin } from "../../middleware/admin/adminAuth.js";
import * as productController from "../../controller/admin/productController.js";
import { createMemoryUpload, handleUploadError } from "../../config/multer.js";
import { uploadToCloudinary } from "../../middleware/cloudinaryUpload.js";
import { validateRequest } from "../../middleware/validationMiddleware.js";
import { createProductSchema, updateProductSchema } from "../../validators/admin/productValidation.js";

const uploadProductMemory = createMemoryUpload();

// Helper middleware to map new image counts for Joi validation
const mapImageCounts = (req, res, next) => {
    if (req.body.colorOptions) {
        try {
            const colors = typeof req.body.colorOptions === 'string' ? JSON.parse(req.body.colorOptions) : req.body.colorOptions;
            colors.forEach((col, index) => {
                const count = (req.files || []).filter(f => f.fieldname === `color_images_${index}`).length;
                col.newImagesCount = count;
            });
            req.body.colorOptions = JSON.stringify(colors);
        } catch (e) {
            // Let Joi validation catch invalid JSON
        }
    }
    next();
};

router.use(isAdmin);

// Listing
router.get("/", productController.getProducts);

// Add product
router.get("/add", productController.getAddProduct);
router.post(
    "/add", 
    uploadProductMemory.any(), 
    handleUploadError, 
    mapImageCounts,
    validateRequest(createProductSchema),
    uploadToCloudinary('smartpick/products'),
    productController.addProduct
);

// Edit product
router.get("/edit/:id", productController.getEditProduct);
router.put(
    "/edit/:id", 
    uploadProductMemory.any(), 
    handleUploadError, 
    mapImageCounts,
    validateRequest(updateProductSchema),
    uploadToCloudinary('smartpick/products'),
    productController.updateProduct
);

// AJAX: fetch subcategories for a picked category
router.get("/subcategories/:categoryId", productController.getSubcategoriesByCategory);

// Toggle visibility / featured
router.patch("/toggle/:id", productController.toggleProduct);
router.patch("/featured/:id", productController.toggleFeatured);

// Soft delete
router.patch("/delete/:id", productController.softDeleteProduct);

export default router;
