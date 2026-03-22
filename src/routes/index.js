import adminRoutes from "./admin/adminRoutes.js";
import userRoutes from "./user/userRoutes.js";

const mountRoutes = (app) => {
  app.use("/admin", adminRoutes);
  app.use("/", userRoutes);
};

export default mountRoutes;
