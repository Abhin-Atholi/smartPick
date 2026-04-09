import Wishlist from "../../model/wishlistModel.js";

export const getWishlistByUserId = async (userId, page, limit) => {
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

    return { products, totalPages, totalItems };
};

export const toggleWishlist = async (userId, productId) => {
    let wishlist = await Wishlist.findOne({ user: userId });
    
    if (!wishlist) {
        wishlist = new Wishlist({ user: userId, products: [productId] });
        await wishlist.save();
        return 'added';
    }

    const index = wishlist.products.indexOf(productId);
    if (index === -1) {
        wishlist.products.push(productId);
        await wishlist.save();
        return 'added';
    } else {
        wishlist.products.splice(index, 1);
        await wishlist.save();
        return 'removed';
    }
};

export const removeFromWishlist = async (userId, productId) => {
    await Wishlist.findOneAndUpdate(
        { user: userId },
        { $pull: { products: productId } }
    );
};

export const getWishlistProductIds = async (userId) => {
    const wl = await Wishlist.findOne({ user: userId }).lean();
    if (wl) {
        return wl.products.map(id => id.toString());
    }
    return [];
};

export const isInWishlist = async (userId, productId) => {
    const wl = await Wishlist.findOne({ user: userId, products: productId }).lean();
    return !!wl;
};
