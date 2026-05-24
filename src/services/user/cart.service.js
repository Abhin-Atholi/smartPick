import mongoose from 'mongoose';
import Cart from '../../model/cartModel.js';
import Product from '../../model/productModel.js';
import Wishlist from '../../model/wishlistModel.js';
import * as offerHelper from '../../utils/offerHelper.js';
import AppError from '../../utils/AppError.js';

import * as pricingService from '../common/pricing.service.js';

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
        let isUnavailable = !product || !product.isCurrentlyAvailable;
        let isOutOfStock = false;
        let isLowStock = false;

        if (product && product.variants) {
            let variant = null;
            
            // 1. Primary Lookup: By variantId
            if (item.variantId) {
                variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
            }
            
            // 2. Secondary Lookup: Fallback to size/color if ID lookup fails (Self-Healing)
            if (!variant && item.size && item.color) {
                const normalize = str => String(str || '').trim().toLowerCase();
                variant = product.variants.find(v => 
                    normalize(v.size) === normalize(item.size) && 
                    normalize(v.color) === normalize(item.color)
                );
                
                // Self-Heal: If we found a match by attributes, update the variantId in the cart document
                // This handles cases where variant IDs changed during admin edits
                if (variant) {
                    item.variantId = variant._id;
                }
            }

            const availableStock = variant ? variant.stock : 0;
            isOutOfStock = !isUnavailable && availableStock === 0;
            isLowStock = !isUnavailable && !isOutOfStock && availableStock < item.quantity;
            
            // If we absolutely couldn't find a variant, treat as unavailable
            if (!variant) isUnavailable = true;

        } else {
            isUnavailable = true;
        }

        const isLimitExceeded = item.quantity > 5;

        if (!isUnavailable && !isOutOfStock && !isLowStock && !isLimitExceeded) {
            validItemsForPricing.push(item);
            activeTotal += item.effectiveTotalPrice;
        } else {
            hasStockIssue = true;
        }
    });

    // Calculate standard financial breakdown using Centralized Pricing Engine
    const pricingResult = pricingService.processPricing(allItemsWithOffers);

    return {
        allItemsWithOffers: pricingResult.items,
        breakdown: pricingResult.breakdown,
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
            breakdown: {
                originalSubtotal: 0,
                subtotal: 0,
                offerDiscount: 0,
                couponDiscount: 0,
                shippingFee: 0,
                total: 0
            },
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
        // Standardized Breakdown (Phase 1 Integration)
        breakdown: breakdown.breakdown,
        // Legacy properties for backward compatibility with EJS views (Removed in later phases)
        originalSubtotal: breakdown.breakdown.originalSubtotal,
        totalOfferDiscount: breakdown.breakdown.offerDiscount,
        cartTotal: breakdown.breakdown.subtotal,
        activeTotal: breakdown.activeTotal,
        hasGlobalStockIssue: breakdown.hasGlobalStockIssue
    };
};

export const addToCart = async (userId, productId, quantity, variantId) => {
    const product = await Product.findById(productId).populate('category subcategory');
    if (!product || !product.isCurrentlyAvailable) throw new AppError("This product is no longer available.", 400);

    let variant;
    if (!variantId) {
        variant = product.variants.find(v => v.stock > 0);
        if (!variant) throw new AppError("This product is currently out of stock", 400);
        variantId = variant._id;
    } else {
        variant = product.variants.find(v => v._id.toString() === variantId.toString());
    }

    if (!variant) throw new AppError("Requested product variant not found", 400);

    // Check stock
    if (variant.stock < quantity) {
        return { success: false, message: `Only ${variant.stock} items left in stock`, code: "OUT_OF_STOCK" };
    }

    let cart = await Cart.findOne({ user: userId });
    if (!cart) {
        cart = new Cart({ user: userId, items: [] });
    }

    const price = variant.price;
    const totalPrice = price * quantity;

    // Check if item with same ID and variantId already exists, using fallback for robustness
    const normalize = str => String(str || '').trim().toLowerCase();
    const existingItemIndex = cart.items.findIndex(item =>
        item.product.toString() === productId &&
        (
            (item.variantId && item.variantId.toString() === variantId.toString()) ||
            (variant && item.size && item.color && normalize(item.size) === normalize(variant.size) && normalize(item.color) === normalize(variant.color))
        )
    );

    const MAX_PER_PRODUCT = 5;

    if (existingItemIndex > -1) {
        return { success: false, message: "Item already in your cart. You can update the quantity from the cart page.", isDuplicate: true };
    } else {
        if (quantity > MAX_PER_PRODUCT) {
            return { success: false, message: `Maximum limit reached. You can only add up to ${MAX_PER_PRODUCT} units.`, code: "LIMIT_REACHED" };
        }

        // Add new item
        cart.items.push({
            product: productId,
            quantity,
            variantId: variant._id,
            size: variant.size,
            color: variant.color,
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
    if (!cart) throw new AppError("Cart not found", 400);

    // Fetch product first to resolve variant details for robust matching
    const product = await Product.findById(productId).populate('category subcategory');
    if (!product || !product.isCurrentlyAvailable) {
        return { success: false, message: "This product is no longer available.", code: "PRODUCT_UNAVAILABLE" };
    }

    let variant = product.variants.find(v => v._id.toString() === variantId.toString());

    // Find the cart item. 
    // Fallback: If the frontend sent a new self-healed variantId but the DB still has the old one,
    // we match using the resolved variant's size and color.
    const normalize = str => String(str || '').trim().toLowerCase();
    const itemIndex = cart.items.findIndex(item =>
        item.product.toString() === productId &&
        (
            (item.variantId && item.variantId.toString() === variantId.toString()) ||
            (variant && item.size && item.color && normalize(item.size) === normalize(variant.size) && normalize(item.color) === normalize(variant.color))
        )
    );

    if (itemIndex === -1) throw new AppError("Item not found in cart", 400);

    if (quantity > MAX_PER_PRODUCT) {
        return { success: false, message: `Maximum limit reached. You can only have ${MAX_PER_PRODUCT} units per product.`, code: "LIMIT_REACHED" };
    }

    const cartItem = cart.items[itemIndex];

    // Secondary Lookup: Fallback to size/color if ID lookup fails (Self-Healing)
    // This happens if the admin edits the product and the variant ID is regenerated.
    if (!variant && cartItem.size && cartItem.color) {
        variant = product.variants.find(v => 
            normalize(v.size) === normalize(cartItem.size) && 
            normalize(v.color) === normalize(cartItem.color)
        );
        
        // Self-Heal: update the variantId in the cart document
        if (variant) {
            cartItem.variantId = variant._id;
        }
    }

    if (!variant || variant.stock < quantity) {
        const available = variant ? variant.stock : 0;
        return { 
            success: false, 
            message: available <= 0 ? "This item is currently out of stock." : `Only ${available} items available in stock`, 
            code: "OUT_OF_STOCK",
            availableStock: available
        };
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
    if (!cart) throw new AppError("Cart not found", 400);

    // Fetch product to resolve variant details for robust matching
    const product = await Product.findById(productId);
    let variant = product ? product.variants.find(v => v._id.toString() === variantId.toString()) : null;

    cart.items = cart.items.filter(item => {
        const normalize = str => String(str || '').trim().toLowerCase();
        const isSameProduct = item.product.toString() === productId;
        const isSameVariantId = item.variantId && item.variantId.toString() === variantId.toString();
        const isSameAttributes = variant && item.size && item.color && normalize(item.size) === normalize(variant.size) && normalize(item.color) === normalize(variant.color);
        
        // Keep the item if it does NOT match our target
        return !(isSameProduct && (isSameVariantId || isSameAttributes));
    });

    await cart.save();

    // Return breakdown for consistency
    const populated = await Cart.populate(cart, {
        path: 'items.product',
        populate: [{ path: 'category' }, { path: 'subcategory' }]
    });
    return _calculateBreakdown(populated.items);
};

