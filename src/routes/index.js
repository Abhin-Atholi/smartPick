import adminRoutes   from "./admin/adminRoutes.js";
import userRoutes    from "./user/userRoutes.js";
import productRoutes from "./user/productRoutes.js";

const mountRoutes = (app) => {
  app.use("/admin", (req, res, next) => {
    res.locals.layout = "layout/adminLayout";
    next();
  }, adminRoutes);
  
  app.use("/", (req, res, next) => {
    res.locals.layout = "layout/layout";
    next();
  }, userRoutes);

  app.use("/products", (req, res, next) => {
    res.locals.layout = "layout/layout";
    next();
  }, productRoutes);
};

export default mountRoutes;
