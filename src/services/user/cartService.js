import mongoose from 'mongoose';
import Cart from '../../model/cartModel.js';
import Product from '../../model/productModel.js';
import Wishlist from '../../model/wishlistModel.js';
import * as offerHelper from '../../utils/offerHelper.js';

// Internal helper to calculate full breakdown
const _calculateBreakdown = async (fullCartItems) => {
    const allItemsWithOffers = await offerHelper.applyOffersToItems(fullCartItems);

    let originalSubtotal = 0;
    let totalOfferDiscount = 0;
    let cartTotal = 0;
    let activeTotal = 0;
    let hasStockIssue = false;

    allItemsWithOffers.forEach(item => {
        const itemMRP = (item.price || 0) * item.quantity;
        const itemEffectiveTotal = item.effectiveTotalPrice || 0;
        const itemOfferDiscount = itemMRP - itemEffectiveTotal;

        originalSubtotal += itemMRP;
        totalOfferDiscount += itemOfferDiscount;
        cartTotal += itemEffectiveTotal;

        const product = item.product;
        const isUnavailable = !product || !product.isCurrentlyAvailable;
        let isOutOfStock = false;
        let isLowStock = false;

        if (product && product.variants) {
            const variant = product.variants.find(v => v.size === item.size && (v.color && v.color.name === item.color));
            const availableStock = variant ? variant.stock : 0;
            isOutOfStock = !isUnavailable && availableStock === 0;
            isLowStock = !isUnavailable && availableStock > 0 && availableStock < item.quantity;
        } else {
            isOutOfStock = true;
        }

        if (!isUnavailable && !isOutOfStock && !isLowStock) {
            activeTotal += itemEffectiveTotal;
        } else {
            hasStockIssue = true;
        }
    });

    return {
        allItemsWithOffers,
        originalSubtotal,
        totalOfferDiscount,
        cartTotal,
        activeTotal,
        hasGlobalStockIssue: hasStockIssue
    };
};

export const getCart = async (userId, page = 1, limit = 4) => {
    const skip = (page - 1) * limit;

    const fullCart = await Cart.findOne({ user: userId }).populate({
        path: 'items.product',
        populate: [{ path: 'category' }, { path: 'subcategory' }]
    });

    const breakdown = await _calculateBreakdown(fullCart.items);

    const totalItems = fullCart.items.length;
    const paginatedItems = breakdown.allItemsWithOffers.slice(skip, skip + limit);

    return {
        items: paginatedItems,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        originalSubtotal: breakdown.originalSubtotal,
        totalOfferDiscount: breakdown.totalOfferDiscount,
        cartTotal: breakdown.cartTotal,
        activeTotal: breakdown.activeTotal,
        hasGlobalStockIssue: breakdown.hasGlobalStockIssue
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
        return { success: false, message: "Item already in your cart. You can update the quantity from the cart page.", isDuplicate: true };
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
    const cart = await Cart.findOne({ user: userId });
    if (!cart) throw new Error("Cart not found");

    const itemIndex = cart.items.findIndex(item =>
        item.product.toString() === productId &&
        item.size === size &&
        item.color === color
    );

    if (itemIndex === -1) throw new Error("Item not found in cart");

    if (quantity > MAX_PER_PRODUCT) {
        return { success: false, message: `Maximum limit reached. You can only have ${MAX_PER_PRODUCT} units per product.`, code: "LIMIT_REACHED" };
    }



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
    
    // Return breakdown for consistency
    const populated = await Cart.populate(cart, {
        path: 'items.product',
        populate: [{ path: 'category' }, { path: 'subcategory' }]
    });
    return _calculateBreakdown(populated.items);
};

export const removeItem = async (userId, productId, size, color) => {
    const cart = await Cart.findOne({ user: userId });
    if (!cart) throw new Error("Cart not found");

    cart.items = cart.items.filter(item =>
        !(item.product.toString() === productId && item.size === size && item.color === color)
    );

    await cart.save();

    // Return breakdown for consistency
    const populated = await Cart.populate(cart, {
        path: 'items.product',
        populate: [{ path: 'category' }, { path: 'subcategory' }]
    });
    return _calculateBreakdown(populated.items);
};
