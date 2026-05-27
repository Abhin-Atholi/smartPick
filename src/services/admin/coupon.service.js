import Coupon from '../../model/couponModel.js';
import AppError from '../../utils/AppError.js';

// ── Shared helper ─────────────────────────────────────────────────────────────
/**
 * Compute a coupon's dynamic display status.
 * Priority: Expired > Inactive > Scheduled > Active
 */
export const computeCouponStatus = (coupon) => {
    const now = new Date();
    if (new Date(coupon.expiryDate) <= now) return 'Expired';
    if (!coupon.isActive) return 'Inactive';
    if (coupon.startDate && new Date(coupon.startDate) > now) return 'Scheduled';
    return 'Active';
};

// ── getCoupons ────────────────────────────────────────────────────────────────
export const getCoupons = async (search, status, page, limit) => {
    const skip = (page - 1) * limit;
    const now = new Date();
    let query = { isDeleted: false };

    if (search) query.code = { $regex: search.trim(), $options: 'i' };

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

    const [coupons, total] = await Promise.all([
        Coupon.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Coupon.countDocuments(query)
    ]);

    const stats = {
        totalCoupons:  await Coupon.countDocuments({ isDeleted: false }),
        activeCoupons: await Coupon.countDocuments({
            isDeleted: false, isActive: true, expiryDate: { $gt: now },
            $or: [{ startDate: { $lte: now } }, { startDate: null }]
        }),
        expiredCoupons: await Coupon.countDocuments({ isDeleted: false, expiryDate: { $lte: now } }),
        totalUsage: (await Coupon.aggregate([
            { $match: { isDeleted: false } },
            { $group: { _id: null, total: { $sum: '$usedCount' } } }
        ]))[0]?.total || 0
    };

    const processedCoupons = coupons.map(c => ({ ...c, dynamicStatus: computeCouponStatus(c) }));

    return { coupons: processedCoupons, total, totalPages: Math.ceil(total / limit), stats };
};

// ── addCoupon ─────────────────────────────────────────────────────────────────
// NOTE: Field-level validation is handled upstream by Joi middleware.
// This layer enforces only BUSINESS rules that require DB access or cross-field logic.
export const addCoupon = async (data) => {
    const {
        code, description, discountType, discountValue,
        minimumAmount, maximumDiscount, usageLimit,
        startDate, expiryDate, isActive
    } = data;

    const trimmedCode = code.trim().toUpperCase();

    // Business rule: duplicate code (case-insensitive)
    const existing = await Coupon.findOne({ code: trimmedCode, isDeleted: false });
    if (existing) throw new AppError('A coupon with this code already exists.');

    // Business rule: flat discount must not equal/exceed minimum purchase
    if (discountType === 'flat' && discountValue >= minimumAmount) {
        throw new AppError('Minimum purchase amount must be greater than the flat discount value.');
    }

    // Business rule: startDate must precede or equal expiryDate
    if (startDate && new Date(startDate) > new Date(expiryDate)) {
        throw new AppError('Start date must be on or before the expiry date.');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate && new Date(startDate) < today) {
        throw new AppError('Start date cannot be in the past.');
    }
    if (expiryDate && new Date(expiryDate) < today) {
        throw new AppError('Expiry date cannot be in the past.');
    }

    const newCoupon = new Coupon({
        code: trimmedCode,
        description,
        discountType,
        discountValue,
        minimumAmount,
        maximumDiscount: discountType === 'percentage' ? maximumDiscount : null,
        usageLimit,
        startDate: startDate ? new Date(startDate) : new Date(),
        expiryDate: new Date(expiryDate),
        isActive: isActive !== false
    });

    await newCoupon.save();
    return newCoupon;
};

// ── editCoupon ────────────────────────────────────────────────────────────────
export const editCoupon = async (id, data) => {
    const {
        code, description, discountType, discountValue,
        minimumAmount, maximumDiscount, usageLimit,
        startDate, expiryDate, isActive
    } = data;

    const coupon = await Coupon.findById(id);
    if (!coupon || coupon.isDeleted) throw new AppError('Coupon not found.');

    if (new Date(coupon.expiryDate) <= new Date()) {
        throw new AppError('Cannot update an expired coupon.');
    }

    // Business rule: flat discount must not equal/exceed minimum purchase
    if (discountType === 'flat' && discountValue >= minimumAmount) {
        throw new AppError('Minimum purchase amount must be greater than the flat discount value.');
    }

    // Business rule: startDate must precede or equal expiryDate
    if (startDate && new Date(startDate) > new Date(expiryDate)) {
        throw new AppError('Start date must be on or before the expiry date.');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate && new Date(startDate) < today) {
        throw new AppError('Start date cannot be in the past.');
    }
    if (expiryDate && new Date(expiryDate) < today) {
        throw new AppError('Expiry date cannot be in the past.');
    }

    // Business rule: usageLimit cannot drop below current used count
    if (usageLimit < coupon.usedCount) {
        throw new AppError(`Usage limit cannot be less than the current used count (${coupon.usedCount}).`);
    }

    // Security lock: if coupon has been used, code and discount type/value are immutable
    if (coupon.usedCount > 0) {
        if (code && code.trim().toUpperCase() !== coupon.code) {
            throw new AppError('Cannot change the code of a coupon that has already been used.');
        }
        if (discountType !== coupon.discountType || discountValue !== coupon.discountValue) {
            throw new AppError('Cannot change the discount type or value of an actively used coupon.');
        }
    } else {
        // Only attempt code change if provided and different
        if (code) {
            const trimmedCode = code.trim().toUpperCase();
            if (trimmedCode !== coupon.code) {
                const dup = await Coupon.findOne({ code: trimmedCode, _id: { $ne: id }, isDeleted: false });
                if (dup) throw new AppError('A coupon with this code already exists.');
                coupon.code = trimmedCode;
            }
        }
        coupon.discountType = discountType;
        coupon.discountValue = discountValue;
    }

    coupon.description = description;
    coupon.minimumAmount = minimumAmount;
    coupon.maximumDiscount = discountType === 'percentage' ? maximumDiscount : null;
    coupon.usageLimit = usageLimit;
    coupon.startDate = startDate ? new Date(startDate) : coupon.startDate;
    coupon.expiryDate = new Date(expiryDate);
    coupon.isActive = isActive !== false;

    await coupon.save();
    return coupon;
};

// ── toggleCoupon ──────────────────────────────────────────────────────────────
export const toggleCoupon = async (id) => {
    const coupon = await Coupon.findById(id);
    if (!coupon || coupon.isDeleted) throw new AppError('Coupon not found.');
    coupon.isActive = !coupon.isActive;
    await coupon.save();
    return coupon;
};

// ── deleteCoupon ──────────────────────────────────────────────────────────────
export const deleteCoupon = async (id) => {
    const coupon = await Coupon.findById(id);
    if (!coupon || coupon.isDeleted) throw new AppError('Coupon not found.');
    coupon.isDeleted = true;
    coupon.isActive = false;
    await coupon.save();
    return coupon;
};
