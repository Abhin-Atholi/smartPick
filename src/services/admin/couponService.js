import Coupon from '../../model/couponModel.js';

export const getCoupons = async (search, status, page, limit) => {
    const skip = (page - 1) * limit;
    let query = { isDeleted: false };

    if (search) {
        query.code = { $regex: search.trim(), $options: 'i' };
    }

    const now = new Date();

    if (status) {
        if (status === 'active') {
            query.isActive = true;
            query.expiryDate = { $gt: now };
        } else if (status === 'inactive') {
            query.isActive = false;
        } else if (status === 'expired') {
            query.expiryDate = { $lte: now };
        }
    }

    const total = await Coupon.countDocuments(query);
    const coupons = await Coupon.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const processedCoupons = coupons.map(c => {
        let dynamicStatus = 'Active';
        if (new Date(c.expiryDate) <= now) {
            dynamicStatus = 'Expired';
        } else if (!c.isActive) {
            dynamicStatus = 'Inactive';
        }
        return { ...c, dynamicStatus };
    });

    return {
        coupons: processedCoupons,
        total,
        totalPages: Math.ceil(total / limit)
    };
};

export const addCoupon = async (data) => {
    const { code, description, discountType, discountValue, minimumAmount, maximumDiscount, usageLimit, startDate, expiryDate, isActive } = data;

    if (!code || !discountType || !discountValue || !minimumAmount || !usageLimit || !expiryDate) {
        throw new Error("Missing required fields.");
    }

    const trimmedCode = code.trim().toUpperCase();
    
    const existing = await Coupon.findOne({ code: trimmedCode, isDeleted: false });
    if (existing) {
        throw new Error("Coupon code already exists.");
    }

    const valDiscount = Number(discountValue);
    const valMinAmount = Number(minimumAmount);
    const valMaxDiscount = Number(maximumDiscount);
    const valUsageLimit = Number(usageLimit);

    if (valDiscount < 1 || valMinAmount < 0 || valUsageLimit < 1) {
        throw new Error("Values must be positive numbers.");
    }

    if (discountType === 'flat') {
        if (valDiscount >= valMinAmount) {
            throw new Error("Flat discount must be strictly less than the minimum purchase amount.");
        }
    } else if (discountType === 'percentage') {
        if (valDiscount < 1 || valDiscount > 90) {
            throw new Error("Percentage discount must be between 1% and 90%.");
        }
        if (!valMaxDiscount || valMaxDiscount < 1) {
            throw new Error("Maximum discount is required for percentage type coupons.");
        }
    } else {
        throw new Error("Invalid discount type.");
    }

    if (new Date(expiryDate) <= new Date()) {
        throw new Error("Expiry date must be in the future.");
    }
    if (startDate && expiryDate && new Date(startDate) >= new Date(expiryDate)) {
        throw new Error("Start date must be before expiry date.");
    }

    const newCoupon = new Coupon({
        code: trimmedCode,
        description,
        discountType,
        discountValue: valDiscount,
        minimumAmount: valMinAmount,
        maximumDiscount: discountType === 'percentage' ? valMaxDiscount : null,
        usageLimit: valUsageLimit,
        startDate: startDate ? new Date(startDate) : new Date(),
        expiryDate: new Date(expiryDate),
        isActive: isActive === 'true' || isActive === true
    });

    await newCoupon.save();
    return newCoupon;
};

export const editCoupon = async (id, data) => {
    const { code, description, discountType, discountValue, minimumAmount, maximumDiscount, usageLimit, startDate, expiryDate, isActive } = data;

    const coupon = await Coupon.findById(id);
    if (!coupon || coupon.isDeleted) {
        throw new Error("Coupon not found.");
    }

    const valDiscount = Number(discountValue);
    const valMinAmount = Number(minimumAmount);
    const valMaxDiscount = Number(maximumDiscount);
    const valUsageLimit = Number(usageLimit);

    if (valDiscount < 1 || valMinAmount < 0 || valUsageLimit < 1) {
        throw new Error("Values must be positive numbers.");
    }

    if (discountType === 'flat') {
        if (valDiscount >= valMinAmount) {
            throw new Error("Flat discount must be strictly less than the minimum purchase amount.");
        }
        coupon.maximumDiscount = null;
    } else if (discountType === 'percentage') {
        if (valDiscount < 1 || valDiscount > 90) {
            throw new Error("Percentage discount must be between 1% and 90%.");
        }
        if (!valMaxDiscount || valMaxDiscount < 1) {
            throw new Error("Maximum discount is required for percentage type coupons.");
        }
        coupon.maximumDiscount = valMaxDiscount;
    }

    if (new Date(expiryDate) <= new Date()) {
        throw new Error("Expiry date must be in the future.");
    }

    // Security Lock logic
    if (coupon.usedCount > 0) {
        if (code.trim().toUpperCase() !== coupon.code) {
            throw new Error("Cannot change the code of a coupon that has already been used.");
        }
        if (discountType !== coupon.discountType || valDiscount !== coupon.discountValue) {
            throw new Error("Cannot change the discount type or value of an actively used coupon.");
        }
    } else {
        const trimmedCode = code.trim().toUpperCase();
        if (trimmedCode !== coupon.code) {
            const existing = await Coupon.findOne({ code: trimmedCode, _id: { $ne: id }, isDeleted: false });
            if (existing) throw new Error("Coupon code already in use.");
            coupon.code = trimmedCode;
        }
        coupon.discountType = discountType;
        coupon.discountValue = valDiscount;
    }

    coupon.description = description;
    coupon.minimumAmount = valMinAmount;
    coupon.usageLimit = valUsageLimit;
    if (startDate && expiryDate && new Date(startDate) >= new Date(expiryDate)) {
        throw new Error("Start date must be before expiry date.");
    }
    coupon.startDate = startDate ? new Date(startDate) : coupon.startDate;
    coupon.expiryDate = new Date(expiryDate);
    coupon.isActive = isActive === 'true' || isActive === true;

    await coupon.save();
    return coupon;
};

export const toggleCoupon = async (id) => {
    const coupon = await Coupon.findById(id);
    if (!coupon || coupon.isDeleted) {
        throw new Error("Coupon not found.");
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();
    return coupon;
};

export const deleteCoupon = async (id) => {
    const coupon = await Coupon.findById(id);
    if (!coupon || coupon.isDeleted) {
        throw new Error("Coupon not found.");
    }

    coupon.isDeleted = true;
    coupon.isActive = false; // Disable it just to be safe
    await coupon.save();
    return coupon;
};
