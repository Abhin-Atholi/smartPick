
import * as adminService from "../../services/admin/adminService.js";

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
            fullName:admin.fullName
        };

        req.session.save(() => res.redirect("/admin/dashboard"));
    } catch (error) {
        res.redirect(`/admin/login?msg=${encodeURIComponent(error.message)}`);
    }
};

export const getLogin = (req, res) => {
    res.render("admin/login", { msg: req.query.msg || null, title: "Admin Login", layout: "layout/layout" });
};

export const getDashboard = (req, res) => {
    res.render("admin/dashboard", { title: "Admin Dashboard" });
};

/**
 * Unified Logout: Handles Passport and Manual Session destruction
 */
export const adminLogout = (req, res) => {
    req.session.admin = null;
    req.session.adminId = null;
    // Force save to ensure the change is written to the database/store
    req.session.save((err) => {
        if (err) console.error(err);
        res.redirect("/admin/login");
    });
};

/**
 * Customer Management with Pagination & Search
 */
export const getCustomers = async (req, res) => {
    try {
        const { search, status } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = 10;

        const { customers, totalPages } = await adminService.getCustomers(search, status, page, limit);

        res.render("admin/customers", {
            customers,
            title: "Customer Management",
            currentSearch: search || "",
            currentStatus: status || "All",
            currentPage: page,
            totalPages: totalPages
        });
    } catch (error) {
        res.status(500).send("Server Error");
    }
};

/**
 * Toggle Block/Unblock via Fetch API
 */
export const toggleCustomerStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await adminService.toggleCustomerStatus(id);
        res.json({ success: true, newStatus: user.status });
    } catch (error) {
        if (error.message === "Permission denied.") {
            return res.status(403).json({ success: false });
        }
        res.status(500).json({ success: false });
    }
};