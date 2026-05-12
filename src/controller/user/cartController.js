import * as cartService from '../../services/user/cartService.js';
import * as taxHelper from '../../utils/taxHelper.js';

export const loadCart = async (req, res, next) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        if (!userId) return res.redirect("/login");

        const page = parseInt(req.query.page) || 1;
        const limit = 4; // Show 4 items per page in cart

        const cartData = await cartService.getCart(userId, page, limit);
        const estimatedTax = taxHelper.calculateTax(cartData.cartTotal);

        res.render("user/products/cart", {
            title: "Shopping Cart — SmartPick",
            cart: cartData, // This now contains { items, cartTotal, totalPages, currentPage, etc. }
            estimatedTax,
            activePath: "/cart"
        });
    } catch (err) {
        console.error("loadCart error:", err);
        next(err);
    }
};

export const addToCart = async (req, res, next) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Please login to add items to cart" });
        }

        const { productId, quantity, variantId } = req.body;
        const result = await cartService.addToCart(userId, productId, parseInt(quantity) || 1, variantId);
        if (result.isDuplicate) {
            return res.status(400).json({ success: false, message: result.message });
        }
        res.json({ success: true, message: "Added to cart successfully!", itemCount: result.items.length });
    } catch (err) {
        if (!err.message.includes("already in your cart")) {
            console.error("addToCart error:", err);
        }
        res.status(400).json({ success: false, message: err.message });
    }
};

export const updateQuantity = async (req, res, next) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { productId, variantId, quantity } = req.body;

        const result = await cartService.updateQuantity(userId, productId, variantId, parseInt(quantity));
        if (result && result.code === "LIMIT_REACHED") {
            return res.status(400).json({ success: false, message: result.message, code: result.code });
        }

        res.json({
            success: true,
            ...result,
            estimatedTax: taxHelper.calculateTax(result.activeTotal)
        });
    } catch (err) {
        if (!err.message.includes("Maximum limit reached") && !err.message.includes("Units per product")) {
            console.error("updateQuantity error:", err);
        }
        res.status(400).json({ success: false, message: err.message });
    }
};

export const removeItem = async (req, res, next) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { productId, variantId } = req.body;

        const cart = await cartService.removeItem(userId, productId, variantId);

        res.json({
            success: true,
            ...cart,
            itemCount: cart.allItemsWithOffers.length,
            estimatedTax: taxHelper.calculateTax(cart.activeTotal)
        });
    } catch (err) {
        console.error("removeItem error:", err);
        res.status(400).json({ success: false, message: err.message });
    }
};
