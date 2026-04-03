import * as cartService from '../../services/user/cartService.js';

export const loadCart = async (req, res, next) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        if (!userId) return res.redirect("/login");

        const page = parseInt(req.query.page) || 1;
        const limit = 4; // Show 4 items per page in cart

        const cartData = await cartService.getCart(userId, page, limit);
        res.render("user/products/cart", {
            title: "Shopping Cart — SmartPick",
            cart: cartData, // This now contains { items, cartTotal, totalPages, currentPage, etc. }
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

        const { productId, quantity, size, color } = req.body;
        const cart = await cartService.addToCart(userId, productId, parseInt(quantity) || 1, size, color);
        res.json({ success: true, message: "Added to cart successfully!", itemCount: cart.items.length });
    } catch (err) {
        console.error("addToCart error:", err);
        res.status(400).json({ success: false, message: err.message });
    }
};

export const updateQuantity = async (req, res, next) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { productId, size, color, quantity } = req.body;

        const cart = await cartService.updateQuantity(userId, productId, size, color, parseInt(quantity));

        res.json({ 
            success: true, 
            cartTotal: cart.cartTotal,
            itemTotal: cart.items.find(i => i.product.toString() === productId && i.size === size && i.color === color).totalPrice
        });
    } catch (err) {
        console.error("updateQuantity error:", err);
        res.status(400).json({ success: false, message: err.message });
    }
};

export const removeItem = async (req, res, next) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { productId, size, color } = req.body;

        const cart = await cartService.removeItem(userId, productId, size, color);

        res.json({ 
            success: true, 
            cartTotal: cart.cartTotal,
            itemCount: cart.items.length
        });
    } catch (err) {
        console.error("removeItem error:", err);
        res.status(400).json({ success: false, message: err.message });
    }
};
