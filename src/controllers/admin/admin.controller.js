
import * as adminService from "../../services/admin/admin.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const postLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Controller calls the service
        const admin = await adminService.authenticateAdmin(email, password);

        // Controller handles the session
        req.session.adminId = admin._id;
        req.session.admin = {
            _id: admin._id,
            email: admin.email,
            role: admin.role,
            fullName: admin.fullName
        };

        req.session.save(() => res.redirect("/admin/dashboard"));
    } catch (err) {
        res.redirect(`/admin/login?msg=${encodeURIComponent(err.message)}`);
    }
};

export const getLogin = (req, res) => {
    res.render("admin/auth/login", { msg: req.query.msg || null, title: "Admin Login", layout: "layout/layout" });
};

export const getDashboard = (req, res) => {
    res.render("admin/dashboard/dashboard", { title: "Admin Dashboard" });
};

/**
 * Unified Logout: Handles Passport and Manual Session destruction
 */
export const adminLogout = (req, res) => {
    req.session.admin = null;
    req.session.adminId = null;
    // Force save to ensure the change is written to the database/store
    req.session.save((err) => {
        if (err) if (!err.isOperational) console.error(err);
        res.redirect("/admin/login");
    });
};

/**
 * Customer Management with Pagination & Search
 */
export const getCustomers = asyncHandler(async (req, res) => {
    const { search, status } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;

    const { customers, totalPages } = await adminService.getCustomers(search, status, page, limit);

    res.render("admin/customers/customers", {
        customers,
        title: "Customer Management",
        currentSearch: search || "",
        currentStatus: status || "All",
        currentPage: page,
        totalPages: totalPages,
        activePath: "/admin/customers"
    });
});

/**
 * Toggle Block/Unblock via Fetch API
 */
export const toggleCustomerStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = await adminService.toggleCustomerStatus(id);
    res.json({ success: true, newStatus: user.status });
});

