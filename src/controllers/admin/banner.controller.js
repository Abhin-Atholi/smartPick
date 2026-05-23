import * as bannerService from "../../services/admin/banner.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess, sendError } from "../../utils/responseHandler.js";

export const getBanners = asyncHandler(async (req, res) => {
    const banners = await bannerService.getAllBanners();
    const activeBanner = banners.find(b => b.isActive);
    
    res.render("admin/banners/banners", {
        title: "Banner Management",
        banners,
        activeBanner,
        activePath: "/admin/banners"
    });
});

export const uploadBanner = asyncHandler(async (req, res) => {
    if (!req.file) {
        return sendError(res, "A banner image is required.", 400);
    }

    const { title } = req.body;

    await bannerService.createBanner({
        title: title || "Homepage Banner",
        imageUrl: req.file.path,
        isActive: true // Make new uploads active by default
    });

    sendSuccess(res, { message: "Banner uploaded and activated successfully!" }, 201);
});

export const activateBanner = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const banner = await bannerService.activateBanner(id);
    
    if (!banner) {
        return sendError(res, "Banner not found.", 404);
    }
    
    sendSuccess(res, { message: "Banner activated successfully." });
});

export const deleteBanner = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const deleted = await bannerService.deleteBanner(id);
    
    if (!deleted) {
        return sendError(res, "Banner not found.", 404);
    }
    
    sendSuccess(res, { message: "Banner deleted successfully." });
});


