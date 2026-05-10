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
        const product = item.product;
        if (!product) return item;

        const categoryId = product.category?._id || product.category;
        const basePrice = item.price;

        const offer = await getBestOffer(product._id, categoryId, basePrice);

        if (offer) {
            return {
                ...item,
                effectivePrice: offer.finalPrice,
                effectiveTotalPrice: parseFloat((offer.finalPrice * item.quantity).toFixed(2)),
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
            ...item,
            effectivePrice: basePrice,
            effectiveTotalPrice: parseFloat((basePrice * item.quantity).toFixed(2)),
            offerApplied: null
        };
    }));
};
