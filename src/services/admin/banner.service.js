import Banner from "../../model/bannerModel.js";
import { deleteCloudinaryFile } from "../../utils/fileHelper.js";

/**
 * Get all banners, sorted by creation date descending
 */
export const getAllBanners = async () => {
    return await Banner.find({}).sort({ createdAt: -1 });
};

/**
 * Get the currently active banner
 */
export const getActiveBanner = async () => {
    return await Banner.findOne({ isActive: true });
};

/**
 * Extract publicId from Cloudinary URL
 */
const extractPublicId = (imageUrl) => {
    if (!imageUrl) return "";
    const parts = imageUrl.split('/');
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex !== -1) {
        const publicIdWithFormat = parts.slice(uploadIndex + 2).join('/');
        return publicIdWithFormat.split('.')[0];
    }
    return "";
};

/**
 * Create a new banner and make it the only active one
 */
export const createBanner = async (bannerData) => {
    // If this new banner is active, deactivate all others
    if (bannerData.isActive) {
        await Banner.updateMany({}, { isActive: false });
    }

    const publicId = extractPublicId(bannerData.imageUrl);

    const newBanner = new Banner({
        title: bannerData.title || "Homepage Banner",
        imageUrl: bannerData.imageUrl,
        publicId: publicId,
        isActive: bannerData.isActive !== undefined ? bannerData.isActive : true
    });

    return await newBanner.save();
};

/**
 * Set a specific banner as active, deactivating others
 */
export const activateBanner = async (bannerId) => {
    // Deactivate all
    await Banner.updateMany({}, { isActive: false });

    // Activate the selected one
    const banner = await Banner.findById(bannerId);
    if (!banner) return null;

    banner.isActive = true;
    return await banner.save();
};

/**
 * Delete a banner and its associated image on Cloudinary
 */
export const deleteBanner = async (bannerId) => {
    const banner = await Banner.findById(bannerId);
    if (!banner) return null;

    if (banner.publicId) {
        try {
            await deleteCloudinaryFile(banner.publicId);
        } catch (error) {
            console.error("Non-fatal error: Failed to purge banner image:", error);
        }
    }

    return await Banner.findByIdAndDelete(bannerId);
};
