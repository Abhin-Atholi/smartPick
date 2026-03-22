import User from "../../model/userModel.js";
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
    res.render("admin/login", { msg: req.query.msg || null, title: "Admin Login" });
};

export const getDashboard = (req, res) => {
    res.render("admin/dashboard", { title: "Admin Dashboard",layout: "layouts/adminLayout" });
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
        const skip = (page - 1) * limit;

        let query = { role: "user" };

        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } }
            ];
        }

        if (status && status !== "All") {
            query.status = status.toLowerCase();
        }

        const totalUsers = await User.countDocuments(query);
        const totalPages = Math.ceil(totalUsers / limit);

        const customers = await User.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render("admin/customers", {
            layout: "layouts/adminLayout",
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
        const user = await User.findById(id);
        
        // Ensure we don't block an admin by mistake via this route
        if (user.role === 'admin') return res.status(403).json({ success: false });

        user.status = user.status === "active" ? "blocked" : "active";
        await user.save();
        
        res.json({ success: true, newStatus: user.status });
    } catch (error) {
        res.status(500).json({ success: false });
    }
};