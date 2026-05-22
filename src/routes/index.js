import adminRoutes   from "./admin/admin.routes.js";
import userRoutes    from "./user/user.routes.js";

const mountRoutes = (app) => {
  app.use("/admin", (req, res, next) => {
    res.locals.layout = "layout/adminLayout";
    next();
  }, adminRoutes);
  
  app.use("/", (req, res, next) => {
    res.locals.layout = "layout/layout";
    next();
  }, userRoutes);
};

export default mountRoutes;

