import User from "../model/userModel.js";

/**
 * Ensures only users with the 'admin' role can proceed.
 * This should be used on all routes starting with /admin (except /login)
 */
export const isAdmin = async (req, res, next) => {
  try {
    // 1. Check if user is logged in via session
    if (!req.session?.userId) {
      return res.redirect("/admin/login?msg=Please login as admin first");
    }

    // 2. Fetch user from DB to verify role (most secure way)
    const user = await User.findById(req.session.userId);

    if (!user || user.role !== "admin") {
      // If they are a normal user trying to access /admin, kick them out
      return res.redirect("/login?msg=Unauthorized access");
    }

    // 3. User is an admin, let them through
    next();
  } catch (error) {
    console.error("Admin Auth Middleware Error:", error);
    res.status(500).send("Internal Server Error");
  }
};

/**
 * Prevents logged-in admins from seeing the admin login page
 */
export const redirectIfAdminAuth = async (req, res, next) => {
    if (req.session?.userId) {
        const user = await User.findById(req.session.userId);
        if (user && user.role === 'admin') {
            return res.redirect("/admin/dashboard");
        }
    }
    next();
};