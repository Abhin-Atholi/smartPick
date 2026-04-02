import Wishlist from "../../model/wishlistModel.js";
import Product from "../../model/productModel.js";

export const getWishlist = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        // 1. Get total products count for this user's wishlist
        const wishlistCount = await Wishlist.findOne({ user: userId });
        const totalItems = wishlistCount ? wishlistCount.products.length : 0;
        const totalPages = Math.ceil(totalItems / limit);

        // 2. Fetch paginated products
        let wishlist = await Wishlist.findOne({ user: userId }).populate({
            path: 'products',
            options: {
                skip: skip,
                limit: limit,
                sort: { createdAt: -1 } // Optional: Show newest first
            },
            populate: [
                { path: 'category' },
                { path: 'subcategory' }
            ]
        });

        const products = wishlist ? wishlist.products : [];

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

        let wishlist = await Wishlist.findOne({ user: userId });
        if (!wishlist) {
            wishlist = new Wishlist({ user: userId, products: [productId] });
            await wishlist.save();
            return res.json({ success: true, action: 'added' });
        }

        const index = wishlist.products.indexOf(productId);
        if (index === -1) {
            wishlist.products.push(productId);
            await wishlist.save();
            return res.json({ success: true, action: 'added' });
        } else {
            wishlist.products.splice(index, 1);
            await wishlist.save();
            return res.json({ success: true, action: 'removed' });
        }
    } catch (err) {
        console.error("toggleWishlist error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

export const removeFromWishlist = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const { productId } = req.body;

        await Wishlist.findOneAndUpdate(
            { user: userId },
            { $pull: { products: productId } }
        );

        res.json({ success: true });
    } catch (err) {
        console.error("removeFromWishlist error:", err);
        res.status(500).json({ success: false });
    }
};
