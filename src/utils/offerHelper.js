import Offer from '../model/offerModel.js';
import * as pricingService from '../services/common/pricingService.js';

/**
 * Fetch all active applicable offers for a product and category.
 * @param {ObjectId|string} productId 
 * @param {ObjectId|string} categoryId 
 * @returns {Promise<Array>} Array of active offers
 */
export const getApplicableOffers = async (productId, categoryId) => {
    const now = new Date();
    return await Offer.find({
        isActive: true,
        isDeleted: false,
        startDate: { $lte: now },
        expiryDate: { $gt: now },
        $or: [
            { offerType: 'product', applicableTo: productId },
            { offerType: 'category', applicableTo: categoryId }
        ]
    }).lean();
};

/**
 * Fetch the single best active offer for a product variant based on basePrice.
 * 
 * @param {ObjectId|string} productId 
 * @param {ObjectId|string} categoryId 
 * @param {number} basePrice - The base variant price to calculate against
 * @returns {Promise<{ originalPrice, finalPrice, discountAmount, effectiveDiscountPercent, appliedOffer }|null>}
 */
export const getBestOffer = async (productId, categoryId, basePrice) => {
    const offers = await getApplicableOffers(productId, categoryId);
    
    if (!offers || offers.length === 0) return null;

    const pricing = pricingService.calculateItemPrice(basePrice, offers);
    
    // Return null if no discount was actually applied
    if (!pricing.appliedOffer) return null;
    
    return pricing;
};

/**
 * Apply best offer to an array of cart/order items.
 * Mutates items in-place, adding standardized pricing fields.
 * 
 * @param {Array} items - Each item must have: product (populated), price (original base price), quantity
 * @returns {Promise<Array>} - Same items enriched with offer data
 */
export const applyOffersToItems = async (items) => {
    return await Promise.all(items.map(async (item) => {
        const itemObj = item.toObject ? item.toObject({ virtuals: true }) : item;
        const product = itemObj.product;
        
        if (!product) {
            itemObj.originalPrice = itemObj.price;
            itemObj.finalPrice = itemObj.price;
            itemObj.discountAmount = 0;
            return itemObj;
        }

        const categoryId = product.category?._id || product.category;
        const basePrice = itemObj.price; // Assuming cart items store basePrice in 'price' field currently

        const offers = await getApplicableOffers(product._id, categoryId);
        const pricing = pricingService.calculateItemPrice(basePrice, offers);

        return {
            ...itemObj,
            originalPrice: pricing.originalPrice,
            finalPrice: pricing.finalPrice,
            discountAmount: pricing.discountAmount,
            effectiveTotalPrice: parseFloat((pricing.finalPrice * itemObj.quantity).toFixed(2)),
            offerApplied: pricing.appliedOffer
        };
    }));
};

/**
 * Apply best offer to an array of raw Product documents/objects (for listings).
 * @param {Array} products 
 * @returns {Promise<Array>} - Enriched products with .bestOffer
 */
export const applyOffersToProducts = async (products) => {
    return await Promise.all(products.map(async (p) => {
        if (!p.variants || p.variants.length === 0) return p;
        
        // Use min price of variants as the baseline for the grid display
        const basePrice = Math.min(...p.variants.map(v => v.price));
        const categoryId = p.category?._id || p.category;

        const offers = await getApplicableOffers(p._id, categoryId);
        const pricing = pricingService.calculateItemPrice(basePrice, offers);
        
        // Ensure backward compatibility with existing views if they expect .bestOffer
        let bestOfferData = null;
        if (pricing.appliedOffer) {
            // Reconstruct the old structure just for product listing views if needed,
            // or better, standardise the views. For now, matching old structure:
            bestOfferData = {
                offerId: pricing.appliedOffer.offerId,
                offerName: pricing.appliedOffer.name,
                offerType: pricing.appliedOffer.offerType,
                discountType: pricing.appliedOffer.discountType,
                discountValue: pricing.appliedOffer.discountValue,
                discountAmount: pricing.discountAmount,
                originalPrice: pricing.originalPrice,
                finalPrice: pricing.finalPrice
            };
        }

        return { ...p, bestOffer: bestOfferData };
    }));
};
