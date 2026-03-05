import User from "../model/userModel.js";
import bcrypt from "bcrypt";

export const postLogin = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Basic Input Validation
        if (!email || !password) {
            return res.render("admin/login", { 
                msg: "All fields are required.",
                title: "Admin Login" 
            });
        }

        // 2. Find the user and verify they are an Admin
        // We use .select("+password") if your schema hides password by default
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            return res.render("admin/login", { 
                msg: "Invalid admin credentials.", 
                title: "Admin Login" 
            });
        }

        // 3. Check Role (Safety check even though we found by email)
        if (user.role !== "admin") {
            return res.render("admin/login", { 
                msg: "Access denied. Not an admin account.", 
                title: "Admin Login" 
            });
        }

        // 4. Verify Password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.render("admin/login", { 
                msg: "Invalid admin credentials.", 
                title: "Admin Login" 
            });
        }

        
        // 6. Establish Session (Matches your isAuth.js logic)
        req.session.userId = user._id;
        req.session.user = {
            id: user._id,
            email: user.email,
            fullName: user.fullName,
            role: user.role
        };

        // 7. Save session and redirect
        req.session.save((err) => {
            if (err) {
                console.error("Session Save Error:", err);
                return res.render("admin/login", { msg: "Session error, try again." });
            }
            res.redirect("/admin/dashboard");
        });

    } catch (error) {
        console.error("Admin Login Error:", error);
        res.render("admin/login", { 
            msg: "An internal server error occurred.", 
            title: "Admin Login" 
        });
    }
};

export const getLogin = (req, res) => {
    res.render("admin/login", { msg: null, title: "Admin Login" });
};

export const getDashboard = (req, res) => {
    res.render("admin/dashboard", { title: "Admin Dashboard",layout: "layouts/adminLayout" });
};

export const logout = (req, res) => {
    req.session.destroy(() => {
        res.redirect("/admin/login");
    });
};

// src/controller/adminController.js

export const getCustomers = async (req, res) => {
    try {
        const { search, status } = req.query;
        const page = parseInt(req.query.page) || 1; // Current page number
        const limit = 10; // Number of users per page
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

        // Get total count for pagination math
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
        console.error("Fetch Customers Error:", error);
        res.status(500).send("Server Error");
    }
};

// Toggle Block/Unblock
export const toggleCustomerStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findById(id);
        
        user.status = user.status === "active" ? "blocked" : "active";
        await user.save();
        
        res.json({ success: true, newStatus: user.status });
    } catch (error) {
        res.status(500).json({ success: false });
    }
};

export const postLogout = (req, res, next) => {
    // 1. Passport's async logout
    req.logout((err) => {
        if (err) {
            console.error("Logout Error:", err);
            return next(err);
        }
        
        // 2. Destroy the physical session in the database/store
        req.session.destroy((err) => {
            if (err) {
                console.error("Session Destruction Error:", err);
                return next(err);
            }
            
            // 3. Wipe the browser cookie and redirect
            res.clearCookie("connect.sid"); 
            res.redirect("/admin/login");
        });
    });
};