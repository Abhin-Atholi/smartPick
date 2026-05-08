import Coupon from '../../model/couponModel.js';

export const getCoupons = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * limit;

        const { search, status } = req.query;
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

        // Calculate dynamic status for each coupon
        const processedCoupons = coupons.map(c => {
            let dynamicStatus = 'Active';
            if (new Date(c.expiryDate) <= now) {
                dynamicStatus = 'Expired';
            } else if (!c.isActive) {
                dynamicStatus = 'Inactive';
            }
            return { ...c, dynamicStatus };
        });

        res.render('admin/coupons', {
            coupons: processedCoupons,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            search: search || '',
            status: status || '',
            title: 'Coupon Management'
        });
    } catch (error) {
        console.error("getCoupons Error:", error);
        res.status(500).render('admin/coupons', { 
            coupons: [], 
            currentPage: 1, 
            totalPages: 1, 
            search: '', 
            status: '',
            title: 'Coupon Management',
            errorMessage: "Internal server error" 
        });
    }
};

export const addCoupon = async (req, res) => {
    try {
        const { code, description, discountType, discountValue, minimumAmount, maximumDiscount, usageLimit, expiryDate } = req.body;

        if (!code || !discountType || !discountValue || !minimumAmount || !usageLimit || !expiryDate) {
            return res.status(400).json({ success: false, message: "Missing required fields." });
        }

        const trimmedCode = code.trim().toUpperCase();
        
        const existing = await Coupon.findOne({ code: trimmedCode, isDeleted: false });
        if (existing) {
            return res.status(400).json({ success: false, message: "Coupon code already exists." });
        }

        const valDiscount = Number(discountValue);
        const valMinAmount = Number(minimumAmount);
        const valMaxDiscount = Number(maximumDiscount);
        const valUsageLimit = Number(usageLimit);

        if (valDiscount < 1 || valMinAmount < 0 || valUsageLimit < 1) {
            return res.status(400).json({ success: false, message: "Values must be positive numbers." });
        }

        if (discountType === 'flat') {
            if (valDiscount >= valMinAmount) {
                return res.status(400).json({ success: false, message: "Flat discount must be strictly less than the minimum purchase amount." });
            }
        } else if (discountType === 'percentage') {
            if (valDiscount < 1 || valDiscount > 90) {
                return res.status(400).json({ success: false, message: "Percentage discount must be between 1% and 90%." });
            }
            if (!valMaxDiscount || valMaxDiscount < 1) {
                return res.status(400).json({ success: false, message: "Maximum discount is required for percentage type coupons." });
            }
        } else {
            return res.status(400).json({ success: false, message: "Invalid discount type." });
        }

        if (new Date(expiryDate) <= new Date()) {
            return res.status(400).json({ success: false, message: "Expiry date must be in the future." });
        }

        const newCoupon = new Coupon({
            code: trimmedCode,
            description,
            discountType,
            discountValue: valDiscount,
            minimumAmount: valMinAmount,
            maximumDiscount: discountType === 'percentage' ? valMaxDiscount : null,
            usageLimit: valUsageLimit,
            expiryDate: new Date(expiryDate),
            isActive: true
        });

        await newCoupon.save();
        return res.status(201).json({ success: true, message: "Coupon added successfully!" });

    } catch (error) {
        console.error("addCoupon Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

export const editCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, description, discountType, discountValue, minimumAmount, maximumDiscount, usageLimit, expiryDate } = req.body;

        const coupon = await Coupon.findById(id);
        if (!coupon || coupon.isDeleted) {
            return res.status(404).json({ success: false, message: "Coupon not found." });
        }

        const valDiscount = Number(discountValue);
        const valMinAmount = Number(minimumAmount);
        const valMaxDiscount = Number(maximumDiscount);
        const valUsageLimit = Number(usageLimit);

        if (valDiscount < 1 || valMinAmount < 0 || valUsageLimit < 1) {
            return res.status(400).json({ success: false, message: "Values must be positive numbers." });
        }

        if (discountType === 'flat') {
            if (valDiscount >= valMinAmount) {
                return res.status(400).json({ success: false, message: "Flat discount must be strictly less than the minimum purchase amount." });
            }
            coupon.maximumDiscount = null; // Clear max discount for flat
        } else if (discountType === 'percentage') {
            if (valDiscount < 1 || valDiscount > 90) {
                return res.status(400).json({ success: false, message: "Percentage discount must be between 1% and 90%." });
            }
            if (!valMaxDiscount || valMaxDiscount < 1) {
                return res.status(400).json({ success: false, message: "Maximum discount is required for percentage type coupons." });
            }
            coupon.maximumDiscount = valMaxDiscount;
        }

        if (new Date(expiryDate) <= new Date()) {
            return res.status(400).json({ success: false, message: "Expiry date must be in the future." });
        }

        // Security Lock logic
        if (coupon.usedCount > 0) {
            if (code.trim().toUpperCase() !== coupon.code) {
                return res.status(400).json({ success: false, message: "Cannot change the code of a coupon that has already been used." });
            }
            if (discountType !== coupon.discountType || valDiscount !== coupon.discountValue) {
                return res.status(400).json({ success: false, message: "Cannot change the discount type or value of an actively used coupon." });
            }
        } else {
            // Can update code if not used
            const trimmedCode = code.trim().toUpperCase();
            if (trimmedCode !== coupon.code) {
                const existing = await Coupon.findOne({ code: trimmedCode, _id: { $ne: id }, isDeleted: false });
                if (existing) return res.status(400).json({ success: false, message: "Coupon code already in use." });
                coupon.code = trimmedCode;
            }
            coupon.discountType = discountType;
            coupon.discountValue = valDiscount;
        }

        coupon.description = description;
        coupon.minimumAmount = valMinAmount;
        coupon.usageLimit = valUsageLimit;
        coupon.expiryDate = new Date(expiryDate);

        await coupon.save();
        return res.status(200).json({ success: true, message: "Coupon updated successfully!" });

    } catch (error) {
        console.error("editCoupon Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

export const toggleCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findById(id);
        if (!coupon || coupon.isDeleted) {
            return res.status(404).json({ success: false, message: "Coupon not found." });
        }

        coupon.isActive = !coupon.isActive;
        await coupon.save();

        return res.status(200).json({ 
            success: true, 
            message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully!`,
            isActive: coupon.isActive
        });
    } catch (error) {
        console.error("toggleCoupon Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

export const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findById(id);
        if (!coupon || coupon.isDeleted) {
            return res.status(404).json({ success: false, message: "Coupon not found." });
        }

        coupon.isDeleted = true;
        coupon.isActive = false; // Disable it just to be safe
        await coupon.save();

        return res.status(200).json({ success: true, message: "Coupon deleted successfully!" });
    } catch (error) {
        console.error("deleteCoupon Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};
