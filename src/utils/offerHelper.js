import Offer from '../model/offerModel.js';

/**
 * Calculate discount amount from an offer given a base price.
 */
const calcDiscount = (offer, basePrice) => {
    if (!offer) return 0;
    let discount = 0;
    if (offer.discountType === 'flat') {
        discount = offer.discountValue;
    } else {
        discount = (basePrice * offer.discountValue) / 100;
    }
    // Never discount more than (price - 1)
    return Math.min(discount, basePrice - 1);
};

/**
 * Fetch the single best (highest discount) active offer for a product.
 * Checks both product-specific and category-wide offers.
 * 
 * @param {ObjectId|string} productId 
 * @param {ObjectId|string} categoryId 
 * @param {number} basePrice - The base variant price to calculate against
 * @returns {Promise<{ offerName, offerType, discountType, discountValue, discountAmount, finalPrice }|null>}
 */
export const getBestOffer = async (productId, categoryId, basePrice) => {
    const now = new Date();

    const offers = await Offer.find({
        isActive: true,
        isDeleted: false,
        expiryDate: { $gt: now },
        $or: [
            { offerType: 'product', applicableTo: productId },
            { offerType: 'category', applicableTo: categoryId }
        ]
    }).lean();

    if (!offers || offers.length === 0) return null;

    let bestOffer = null;
    let bestDiscount = 0;

    for (const offer of offers) {
        const d = calcDiscount(offer, basePrice);
        if (d > bestDiscount) {
            bestDiscount = d;
            bestOffer = offer;
        }
    }

    if (!bestOffer || bestDiscount <= 0) return null;

    const discountAmount = parseFloat(bestDiscount.toFixed(2));
    const finalPrice = parseFloat((basePrice - discountAmount).toFixed(2));

    return {
        offerId: bestOffer._id,
        offerName: bestOffer.name,
        offerType: bestOffer.offerType,
        discountType: bestOffer.discountType,
        discountValue: bestOffer.discountValue,
        discountAmount,
        originalPrice: basePrice,
        finalPrice: Math.max(finalPrice, 1)
    };
};

/**
 * Apply best offer to an array of cart/order items.
 * Mutates items in-place, adding offerApplied, effectivePrice, effectiveTotalPrice.
 * 
 * @param {Array} items - Each item must have: product (populated), size, color, price
 * @returns {Promise<Array>} - Same items enriched with offer data
 */
export const applyOffersToItems = async (items) => {
    return await Promise.all(items.map(async (item) => {
        const itemObj = item.toObject ? item.toObject({ virtuals: true }) : item;
        const product = itemObj.product;
        if (!product) return itemObj;

        const categoryId = product.category?._id || product.category;
        const basePrice = itemObj.price;

        const offer = await getBestOffer(product._id, categoryId, basePrice);

        if (offer) {
            return {
                ...itemObj,
                effectivePrice: offer.finalPrice,
                effectiveTotalPrice: parseFloat((offer.finalPrice * itemObj.quantity).toFixed(2)),
                offerApplied: {
                    offerId: offer.offerId,
                    offerName: offer.offerName,
                    offerType: offer.offerType,
                    discountType: offer.discountType,
                    discountAmount: offer.discountAmount
                }
            };
        }

        return {
            ...itemObj,
            effectivePrice: basePrice,
            effectiveTotalPrice: parseFloat((basePrice * itemObj.quantity).toFixed(2)),
            offerApplied: null
        };
    }));
};

/**
 * Apply best offer to an array of raw Product documents/objects.
 * @param {Array} products 
 * @returns {Promise<Array>} - Enriched products with .bestOffer
 */
export const applyOffersToProducts = async (products) => {
    return await Promise.all(products.map(async (p) => {
        if (!p.variants || p.variants.length === 0) return p;
        
        // Use min price of variants as the baseline for the grid display
        const basePrice = Math.min(...p.variants.map(v => v.price));
        const categoryId = p.category?._id || p.category;

        const bestOffer = await getBestOffer(p._id, categoryId, basePrice);
        
        // Return enriched product
        return { ...p, bestOffer };
    }));
};
