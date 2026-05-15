import mongoose from 'mongoose';
import Cart from '../../model/cartModel.js';
import Product from '../../model/productModel.js';
import Wishlist from '../../model/wishlistModel.js';
import * as offerHelper from '../../utils/offerHelper.js';

import * as pricingService from '../common/pricingService.js';

// Internal helper to calculate full breakdown
const _calculateBreakdown = async (fullCartItems) => {
    const allItemsWithOffers = await offerHelper.applyOffersToItems(fullCartItems);

    let activeTotal = 0;
    let hasStockIssue = false;
    
    // We only want to include valid items in the cart total for checkout
    // But we still show all items in the cart
    const validItemsForPricing = [];

    allItemsWithOffers.forEach(item => {
        const product = item.product;
        const isUnavailable = !product || !product.isCurrentlyAvailable;
        let isOutOfStock = false;
        let isLowStock = false;

        if (product && product.variants) {
            let variant;
            if (item.variantId) {
                variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
            } else if (item.size && item.color) {
                // Fallback for old carts
                variant = product.variants.find(v => v.size === item.size && (v.color && (v.color.name === item.color || v.color === item.color)));
            }
            const availableStock = variant ? variant.stock : 0;
            isOutOfStock = !isUnavailable && availableStock === 0;
            isLowStock = !isUnavailable && availableStock > 0 && availableStock < item.quantity;
        } else {
            isOutOfStock = true;
        }

        if (!isUnavailable && !isOutOfStock && !isLowStock) {
            validItemsForPricing.push(item);
            activeTotal += item.effectiveTotalPrice;
        } else {
            hasStockIssue = true;
        }
    });

    const pricingTotals = pricingService.calculateOrderTotals(allItemsWithOffers);

    return {
        allItemsWithOffers,
        originalSubtotal: pricingTotals.originalSubtotal,
        totalOfferDiscount: pricingTotals.offerDiscount,
        cartTotal: pricingTotals.subtotal,
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

    if (!fullCart) {
        return {
            items: [],
            totalItems: 0,
            totalPages: 1,
            currentPage: page,
            originalSubtotal: 0,
            totalOfferDiscount: 0,
            cartTotal: 0,
            activeTotal: 0,
            hasGlobalStockIssue: false
        };
    }

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

export const addToCart = async (userId, productId, quantity, variantId) => {
    const product = await Product.findById(productId).populate('category subcategory');
    if (!product || !product.isCurrentlyAvailable) throw new Error("This product is no longer available.");

    let variant;
    if (!variantId) {
        variant = product.variants.find(v => v.stock > 0);
        if (!variant) throw new Error("This product is currently out of stock");
        variantId = variant._id;
    } else {
        variant = product.variants.find(v => v._id.toString() === variantId.toString());
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

    // Check if item with same ID and variantId already exists
    const existingItemIndex = cart.items.findIndex(item =>
        item.product.toString() === productId &&
        (item.variantId && item.variantId.toString() === variantId.toString())
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
            variantId: variant._id,
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

export const updateQuantity = async (userId, productId, variantId, quantity) => {
    const MAX_PER_PRODUCT = 5;
    const cart = await Cart.findOne({ user: userId });
    if (!cart) throw new Error("Cart not found");

    const itemIndex = cart.items.findIndex(item =>
        item.product.toString() === productId &&
        (item.variantId && item.variantId.toString() === variantId.toString())
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

    const variant = product.variants.find(v => v._id.toString() === variantId.toString());

    if (!variant || variant.stock < quantity) {
        throw new Error(`Only ${variant ? variant.stock : 0} items available in stock`);
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

export const removeItem = async (userId, productId, variantId) => {
    const cart = await Cart.findOne({ user: userId });
    if (!cart) throw new Error("Cart not found");

    cart.items = cart.items.filter(item =>
        !(item.product.toString() === productId && item.variantId && item.variantId.toString() === variantId.toString())
    );

    await cart.save();

    // Return breakdown for consistency
    const populated = await Cart.populate(cart, {
        path: 'items.product',
        populate: [{ path: 'category' }, { path: 'subcategory' }]
    });
    return _calculateBreakdown(populated.items);
};
