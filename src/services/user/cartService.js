import mongoose from 'mongoose';
import Cart from '../../model/cartModel.js';
import Product from '../../model/productModel.js';
import Wishlist from '../../model/wishlistModel.js';

export const getCart = async (userId, page = 1, limit = 4) => {
    const skip = (page - 1) * limit;

    // We use aggregation to efficiently get total count and paginated items
    const cartData = await Cart.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        { 
            $project: {
                user: 1,
                cartTotal: 1,
                totalItems: { $size: "$items" },
                items: { $slice: ["$items", skip, limit] }
            }
        }
    ]);

    if (!cartData || cartData.length === 0) {
        return { items: [], cartTotal: 0, totalItems: 0, totalPages: 0, currentPage: page };
    }

    const cart = cartData[0];
    
    // Populate the products in the sliced items
    const populatedCart = await Cart.populate(cart, {
        path: 'items.product',
        populate: [
            { path: 'category' },
            { path: 'subcategory' }
        ]
    });

    return {
        ...populatedCart,
        totalPages: Math.ceil(cart.totalItems / limit),
        currentPage: page
    };
};

export const addToCart = async (userId, productId, quantity, size, color) => {
    const product = await Product.findById(productId).populate('category subcategory');
    if (!product || !product.isCurrentlyAvailable) throw new Error("This product is no longer available.");

    // Fallback logic: If size/color not specified (e.g. from a grid "Add to Cart"), 
    // pick the first variant that has stock.
    let variant;
    if (!size || !color) {
        variant = product.variants.find(v => v.stock > 0);
        if (!variant) throw new Error("This product is currently out of stock");
        size = variant.size;
        color = variant.color.name;
    } else {
        variant = product.variants.find(v => v.size === size && v.color.name === color);
    }

    if (!variant) throw new Error("Requested product variant not found");

    // Check stock
    if (variant.stock < quantity) throw new Error(`Only ${variant.stock} items left in stock`);

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
        cart = new Cart({ user: userId, items: [] });
    }

    const price = variant.price;
    const totalPrice = price * quantity;

    // Check if item with same ID, size, and color already exists
    const existingItemIndex = cart.items.findIndex(item => 
        item.product.toString() === productId && 
        item.size === size && 
        item.color === color
    );

    const MAX_PER_PRODUCT = 5;

    if (existingItemIndex > -1) {
        throw new Error("Item already in your cart. You can update the quantity from the cart page.");
    } else {
        if (quantity > MAX_PER_PRODUCT) {
            throw new Error(`Maximum limit reached. You can only add up to ${MAX_PER_PRODUCT} units.`);
        }

        // Add new item
        cart.items.push({
            product: productId,
            quantity,
            size,
            color,
            price,
            totalPrice
        });
    }

    // IMPORTANT: Remove from wishlist if it exists there
    await Wishlist.findOneAndUpdate(
        { user: userId },
        { $pull: { products: productId } }
    );

    await cart.save();
    return cart;
};

export const updateQuantity = async (userId, productId, size, color, quantity) => {
    const MAX_PER_PRODUCT = 5;
    if (quantity > MAX_PER_PRODUCT) {
        throw new Error(`Maximum limit reached. You can only have ${MAX_PER_PRODUCT} units per product.`);
    }

    const cart = await Cart.findOne({ user: userId });
    if (!cart) throw new Error("Cart not found");

    const itemIndex = cart.items.findIndex(item => 
        item.product.toString() === productId && 
        item.size === size && 
        item.color === color
    );

    if (itemIndex === -1) throw new Error("Item not found in cart");

    // Check product status and stock again
    const product = await Product.findById(productId).populate('category subcategory');
    if (!product || !product.isCurrentlyAvailable) {
        throw new Error("This product is no longer available.");
    }

    const variant = product.variants.find(v => v.size === size && v.color.name === color);
    
    if (variant.stock < quantity) {
        throw new Error(`Only ${variant.stock} items available in stock`);
    }

    cart.items[itemIndex].quantity = quantity;
    cart.items[itemIndex].totalPrice = quantity * cart.items[itemIndex].price;

    await cart.save();
    return cart;
};

export const removeItem = async (userId, productId, size, color) => {
    const cart = await Cart.findOne({ user: userId });
    if (!cart) throw new Error("Cart not found");

    cart.items = cart.items.filter(item => 
        !(item.product.toString() === productId && item.size === size && item.color === color)
    );

    await cart.save();
    return cart;
};
