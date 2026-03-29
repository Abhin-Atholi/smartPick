export const isAdmin = (req, res, next) => {
    if (req.session.admin) {
        return next();
    }
    res.redirect("/admin/login?msg=Admin access required");
};

export const redirectIfAdminAuth = (req, res, next) => {
    if (req.session.admin) {
        return res.redirect("/admin/dashboard");
    }
    next();
};
