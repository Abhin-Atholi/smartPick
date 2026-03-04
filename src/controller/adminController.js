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
    res.render("admin/dashboard", { title: "Admin Dashboard" });
};

export const logout = (req, res) => {
    req.session.destroy(() => {
        res.redirect("/admin/login");
    });
};