import adminRoutes   from "./admin/adminRoutes.js";
import userRoutes    from "./user/userRoutes.js";

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
