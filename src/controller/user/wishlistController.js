import * as wishlistService from "../../services/user/wishlistService.js";

export const getWishlist = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        // Use service to fetch
        const { products, totalPages, totalItems } = await wishlistService.getWishlistByUserId(userId, page, limit);

        res.render("user/products/wishlist", {
            title: "My Wishlist — SmartPick",
            products: products,
            activePath: "/wishlist",
            currentPage: page,
            totalPages: totalPages,
            totalProducts: totalItems
        });
    } catch (err) {
        console.error("getWishlist error:", err);
        res.status(500).send("Internal Server Error");
    }
};

export const toggleWishlist = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ success: false, message: "Please login first" });
        }
        const userId = req.session.user._id;
        const { productId } = req.body;

        const action = await wishlistService.toggleWishlist(userId, productId);
        return res.json({ success: true, action });
    } catch (err) {
        console.error("toggleWishlist error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const removeFromWishlist = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { productId } = req.body;

        await wishlistService.removeFromWishlist(userId, productId);

        res.json({ success: true });
    } catch (err) {
        console.error("removeFromWishlist error:", err);
        res.status(500).json({ success: false });
    }
};
