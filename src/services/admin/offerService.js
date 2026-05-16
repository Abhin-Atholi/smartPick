import Offer from '../../model/offerModel.js';
import Product from '../../model/productModel.js';
import Category from '../../model/categoryModel.js';

// ── Shared helper ─────────────────────────────────────────────────────────────
/**
 * Compute an offer's dynamic display status.
 * Priority: Expired > Inactive > Scheduled > Active
 */
export const computeOfferStatus = (offer) => {
    const now = new Date();
    if (new Date(offer.expiryDate) <= now) return 'Expired';
    if (!offer.isActive) return 'Inactive';
    if (offer.startDate && new Date(offer.startDate) > now) return 'Scheduled';
    return 'Active';
};

// ── Overlap detection helper ──────────────────────────────────────────────────
/**
 * Detects whether another active (non-deleted) offer already covers
 * the same (offerType, applicableTo) target within an overlapping date range.
 * Pass `excludeId` when editing to exclude the current offer from the check.
 */
const detectOverlap = async (offerType, applicableTo, startDate, expiryDate, excludeId = null) => {
    const start = startDate ? new Date(startDate) : new Date();
    const expiry = new Date(expiryDate);

    const query = {
        offerType,
        applicableTo,
        isDeleted: false,
        isActive: true,
        // Overlapping condition: existing.startDate < newExpiry AND existing.expiryDate > newStart
        startDate: { $lt: expiry },
        expiryDate: { $gt: start }
    };
    if (excludeId) query._id = { $ne: excludeId };

    return Offer.findOne(query).lean();
};

// ── getOffers ─────────────────────────────────────────────────────────────────
export const getOffers = async ({ search, offerType, status, page, limit }) => {
    const skip = (page - 1) * limit;
    const now = new Date();
    let query = { isDeleted: false };

    if (search) query.name = { $regex: search.trim(), $options: 'i' };
    if (offerType) query.offerType = offerType;

    if (status === 'active') {
        query.isActive = true;
        query.expiryDate = { $gt: now };
        query.$or = [{ startDate: { $lte: now } }, { startDate: null }];
    } else if (status === 'scheduled') {
        query.isActive = true;
        query.startDate = { $gt: now };
        query.expiryDate = { $gt: now };
    } else if (status === 'inactive') {
        query.isActive = false;
    } else if (status === 'expired') {
        query.expiryDate = { $lte: now };
    }

    const total = await Offer.countDocuments(query);
    const offers = await Offer.find(query)
        .sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

    // Enrich with target names and computed status
    const enriched = await Promise.all(offers.map(async (o) => {
        let targetName = 'N/A';
        try {
            if (o.offerType === 'product') {
                const p = await Product.findById(o.applicableTo).select('name').lean();
                targetName = p?.name || 'Deleted Product';
            } else {
                const c = await Category.findById(o.applicableTo).select('name').lean();
                targetName = c?.name || 'Deleted Category';
            }
        } catch (_) { /* swallow */ }

        return { ...o, targetName, dynamicStatus: computeOfferStatus(o) };
    }));

    return { offers: enriched, total, totalPages: Math.ceil(total / limit) };
};

// ── createOffer ───────────────────────────────────────────────────────────────
// NOTE: Field-level validation is handled upstream by Joi middleware.
// This layer enforces only BUSINESS rules.
export const createOffer = async (data) => {
    const { name, description, offerType, discountType, discountValue, applicableTo, startDate, expiryDate, isActive } = data;

    // Business rule: startDate must precede expiryDate
    if (startDate && new Date(startDate) >= new Date(expiryDate)) {
        throw new Error('Start date must be before the expiry date.');
    }

    // Business rule: verify target entity exists and is not deleted/inactive
    if (offerType === 'product') {
        const product = await Product.findById(applicableTo).lean();
        if (!product || product.isDeleted) throw new Error('The selected product does not exist or has been deleted.');
        if (!product.isActive) throw new Error('Cannot create an offer for an inactive product.');
    } else {
        const category = await Category.findById(applicableTo).lean();
        if (!category) throw new Error('The selected category does not exist.');
        if (!category.isActive) throw new Error('Cannot create an offer for an inactive category.');
    }

    // Business rule: detect date-range overlap with existing active offer on same target
    const overlapping = await detectOverlap(offerType, applicableTo, startDate, expiryDate);
    if (overlapping) {
        throw new Error(
            `An active offer "${overlapping.name}" already covers this ${offerType} in the selected date range. ` +
            `Multiple offers are allowed but only the highest discount will apply.`
        );
    }

    const offer = new Offer({
        name: name.trim(),
        description: description?.trim(),
        offerType,
        discountType,
        discountValue: Number(discountValue),
        applicableTo,
        startDate: startDate ? new Date(startDate) : new Date(),
        expiryDate: new Date(expiryDate),
        isActive: isActive !== false
    });

    await offer.save();
    return offer;
};

// ── updateOffer ───────────────────────────────────────────────────────────────
export const updateOffer = async (id, data) => {
    const offer = await Offer.findById(id);
    if (!offer || offer.isDeleted) throw new Error('Offer not found.');

    const { name, description, offerType, discountType, discountValue, applicableTo, startDate, expiryDate, isActive } = data;

    // Business rule: startDate must precede expiryDate
    if (startDate && new Date(startDate) >= new Date(expiryDate)) {
        throw new Error('Start date must be before the expiry date.');
    }

    // Business rule: verify target entity exists
    if (offerType === 'product') {
        const product = await Product.findById(applicableTo).lean();
        if (!product || product.isDeleted) throw new Error('The selected product does not exist or has been deleted.');
    } else {
        const category = await Category.findById(applicableTo).lean();
        if (!category) throw new Error('The selected category does not exist.');
    }

    // Business rule: overlap detection (excluding current offer)
    const overlapping = await detectOverlap(offerType, applicableTo, startDate, expiryDate, id);
    if (overlapping) {
        throw new Error(
            `An active offer "${overlapping.name}" already covers this ${offerType} in the selected date range.`
        );
    }

    offer.name = name.trim();
    offer.description = description?.trim();
    offer.offerType = offerType;
    offer.discountType = discountType;
    offer.discountValue = Number(discountValue);
    offer.applicableTo = applicableTo;
    offer.startDate = startDate ? new Date(startDate) : offer.startDate;
    offer.expiryDate = new Date(expiryDate);
    offer.isActive = isActive !== false;

    await offer.save();
    return offer;
};

// ── toggleOffer ───────────────────────────────────────────────────────────────
export const toggleOffer = async (id) => {
    const offer = await Offer.findById(id);
    if (!offer || offer.isDeleted) throw new Error('Offer not found.');
    offer.isActive = !offer.isActive;
    await offer.save();
    return offer;
};

// ── deleteOffer ───────────────────────────────────────────────────────────────
export const deleteOffer = async (id) => {
    const offer = await Offer.findById(id);
    if (!offer || offer.isDeleted) throw new Error('Offer not found.');
    offer.isDeleted = true;
    offer.isActive = false;
    await offer.save();
    return offer;
};

// ── select helpers ────────────────────────────────────────────────────────────
export const getProductsForSelect = async () =>
    Product.find({ isActive: true, isDeleted: false }).select('name').sort('name').lean();

export const getCategoriesForSelect = async () =>
    Category.find({ isActive: true }).select('name').sort('name').lean();
