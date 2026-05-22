import express from "express";
const router = express.Router();

import { isAdmin } from "../../middleware/admin/adminAuth.js";
import * as bannerController from "../../controllers/admin/banner.controller.js";
import { createCloudinaryUpload, handleUploadError } from "../../config/multer.js";

const uploadBanner = createCloudinaryUpload('smartpick/banners');

// Protect all routes
router.use(isAdmin);

router.get("/", bannerController.getBanners);
router.post("/upload", uploadBanner.single("image"), handleUploadError, bannerController.uploadBanner);
router.patch("/activate/:id", bannerController.activateBanner);
router.delete("/delete/:id", bannerController.deleteBanner);

export default router;

