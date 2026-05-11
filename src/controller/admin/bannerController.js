import * as bannerService from "../../services/admin/bannerService.js";

export const getBanners = async (req, res) => {
    try {
        const banners = await bannerService.getAllBanners();
        const activeBanner = banners.find(b => b.isActive);
        
        res.render("admin/banners", {
            title: "Banner Management",
            banners,
            activeBanner,
            activePath: "/admin/banners"
        });
    } catch (error) {
        console.error("Error fetching banners:", error);
        res.status(500).send("Server Error");
    }
};

export const uploadBanner = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "A banner image is required." });
        }

        const { title } = req.body;

        await bannerService.createBanner({
            title: title || "Homepage Banner",
            imageUrl: req.file.path,
            isActive: true // Make new uploads active by default
        });

        res.status(201).json({ success: true, message: "Banner uploaded and activated successfully!" });
    } catch (error) {
        console.error("Banner upload error:", error);
        res.status(500).json({ success: false, message: "Internal server error during upload." });
    }
};

export const activateBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const banner = await bannerService.activateBanner(id);
        
        if (!banner) {
            return res.status(404).json({ success: false, message: "Banner not found." });
        }
        
        res.json({ success: true, message: "Banner activated successfully." });
    } catch (error) {
        console.error("Activate banner error:", error);
        res.status(500).json({ success: false, message: "Server error activating banner." });
    }
};

export const deleteBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await bannerService.deleteBanner(id);
        
        if (!deleted) {
            return res.status(404).json({ success: false, message: "Banner not found." });
        }
        
        res.json({ success: true, message: "Banner deleted successfully." });
    } catch (error) {
        console.error("Delete banner error:", error);
        res.status(500).json({ success: false, message: "Server error deleting banner." });
    }
};
