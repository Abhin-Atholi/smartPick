import Offer from '../../model/offerModel.js';
import Product from '../../model/productModel.js';
import Category from '../../model/categoryModel.js';

export const getOffers = async ({ search, offerType, status, page, limit }) => {
    const skip = (page - 1) * limit;
    const now = new Date();
    let query = { isDeleted: false };

    if (search) query.name = { $regex: search.trim(), $options: 'i' };
    if (offerType) query.offerType = offerType;

    if (status === 'active') {
        query.isActive = true;
        query.expiryDate = { $gt: now };
    } else if (status === 'inactive') {
        query.isActive = false;
    } else if (status === 'expired') {
        query.expiryDate = { $lte: now };
    }

    const total = await Offer.countDocuments(query);
    const offers = await Offer.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    // Resolve product/category names for display
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
        } catch (_) {}

        const dynamicStatus = new Date(o.expiryDate) <= now ? 'Expired'
            : !o.isActive ? 'Inactive' : 'Active';

        return { ...o, targetName, dynamicStatus };
    }));

    return { offers: enriched, total, totalPages: Math.ceil(total / limit) };
};

export const createOffer = async (data) => {
    const { name, description, offerType, discountType, discountValue, applicableTo, expiryDate } = data;

    if (!name || !offerType || !discountType || !discountValue || !applicableTo || !expiryDate) {
        throw new Error('Missing required fields.');
    }
    if (Number(discountValue) < 1) throw new Error('Discount value must be at least 1.');
    if (discountType === 'percentage' && Number(discountValue) > 90) {
        throw new Error('Percentage discount cannot exceed 90%.');
    }
    if (new Date(expiryDate) <= new Date()) throw new Error('Expiry date must be in the future.');

    const offer = new Offer({
        name: name.trim(),
        description,
        offerType,
        discountType,
        discountValue: Number(discountValue),
        applicableTo,
        expiryDate: new Date(expiryDate),
        isActive: true
    });
    await offer.save();
    return offer;
};

export const updateOffer = async (id, data) => {
    const offer = await Offer.findById(id);
    if (!offer || offer.isDeleted) throw new Error('Offer not found.');

    const { name, description, offerType, discountType, discountValue, applicableTo, expiryDate, startDate, isActive } = data;

    if (Number(discountValue) < 1) throw new Error('Discount value must be at least 1.');
    if (discountType === 'percentage' && Number(discountValue) > 90) {
        throw new Error('Percentage discount cannot exceed 90%.');
    }
    if (new Date(expiryDate) <= new Date()) throw new Error('Expiry date must be in the future.');

    offer.name = name?.trim() || offer.name;
    offer.description = description;
    offer.offerType = offerType || offer.offerType;
    offer.applicableTo = applicableTo || offer.applicableTo;
    offer.discountType = discountType;
    offer.discountValue = Number(discountValue);
    offer.expiryDate = new Date(expiryDate);
    if (startDate) offer.startDate = new Date(startDate);
    if (isActive !== undefined) offer.isActive = isActive;

    await offer.save();
    return offer;
};

export const toggleOffer = async (id) => {
    const offer = await Offer.findById(id);
    if (!offer || offer.isDeleted) throw new Error('Offer not found.');
    offer.isActive = !offer.isActive;
    await offer.save();
    return offer;
};

export const deleteOffer = async (id) => {
    const offer = await Offer.findById(id);
    if (!offer || offer.isDeleted) throw new Error('Offer not found.');
    offer.isDeleted = true;
    offer.isActive = false;
    await offer.save();
    return offer;
};

export const getProductsForSelect = async () => {
    return Product.find({ isActive: true, isDeleted: false }).select('name').sort('name').lean();
};

export const getCategoriesForSelect = async () => {
    return Category.find({ isActive: true }).select('name').sort('name').lean();
};
