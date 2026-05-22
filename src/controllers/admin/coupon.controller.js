import * as couponService from '../../services/admin/coupon.service.js';

export const getCoupons = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const { search, status } = req.query;

        const result = await couponService.getCoupons(search, status, page, limit);

        res.render('admin/coupons', {
            coupons: result.coupons,
            currentPage: page,
            totalPages: result.totalPages,
            search: search || '',
            status: status || '',
            title: 'Coupon Management',
            activePath: "/admin/coupons",
            stats: result.stats
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
        await couponService.addCoupon(req.body);
        return res.status(201).json({ success: true, message: "Coupon added successfully!" });
    } catch (error) {
        if (error.message.includes("Internal server error")) {
            console.error("addCoupon Error:", error);
            return res.status(500).json({ success: false, message: "Internal server error." });
        }
        return res.status(400).json({ success: false, message: error.message });
    }
};

export const editCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        await couponService.editCoupon(id, req.body);
        return res.status(200).json({ success: true, message: "Coupon updated successfully!" });
    } catch (error) {
        if (error.message.includes("Internal server error")) {
            console.error("editCoupon Error:", error);
            return res.status(500).json({ success: false, message: "Internal server error." });
        }
        return res.status(400).json({ success: false, message: error.message });
    }
};

export const toggleCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await couponService.toggleCoupon(id);
        return res.status(200).json({ 
            success: true, 
            message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully!`,
            isActive: coupon.isActive
        });
    } catch (error) {
        if (error.message.includes("Internal server error")) {
            console.error("toggleCoupon Error:", error);
            return res.status(500).json({ success: false, message: "Internal server error." });
        }
        return res.status(404).json({ success: false, message: error.message });
    }
};

export const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        await couponService.deleteCoupon(id);
        return res.status(200).json({ success: true, message: "Coupon deleted successfully!" });
    } catch (error) {
        if (error.message.includes("Internal server error")) {
            console.error("deleteCoupon Error:", error);
            return res.status(500).json({ success: false, message: "Internal server error." });
        }
        return res.status(404).json({ success: false, message: error.message });
    }
};

