import express from "express";
const router = express.Router();
import * as userController from "../../controllers/user/user.controller.js";
import { checkBlocked } from "../../middleware/user/isAuth.js";

// Import Modular Routers
import authRoutes from "./auth.routes.js";
import accountRoutes from "./account.routes.js";
import wishlistRoutes from "./wishlist.routes.js";
import cartRoutes from "./cart.routes.js";
import productRoutes from "./product.routes.js";
import orderRoutes from "./order.routes.js";
import paymentRoutes from "./payment.routes.js";
import couponRoutes from "./coupon.routes.js";
import walletRoutes from "./wallet.routes.js";
import reviewRoutes from "./review.routes.js";

router.use(checkBlocked);

// Public landing & Home
router.get("/", userController.loadHome);
router.get("/home", userController.loadHome);
router.get("/logout", userController.logout);

// Mount Modular Routers
router.use("/", authRoutes);          // /login, /register, etc.
router.use("/account", accountRoutes); // /account, /account/addresses, etc.
router.use("/wishlist", wishlistRoutes); // /wishlist, /wishlist/toggle, etc.
router.use("/cart", cartRoutes);
router.use("/products", productRoutes); // /products, /products/details, etc.
router.use("/payment", paymentRoutes);
router.use("/", orderRoutes); // Mounts /checkout, /order/place, /order/success
router.use("/", couponRoutes); // Mounts /apply-coupon, /remove-coupon
router.use("/", walletRoutes); // Mounts /wallet
router.use("/reviews", reviewRoutes);

// --- 404 Fallback (must be last) ---
router.use((req, res) => {
  res.status(404).render("user/error/404", {
    title: "Page Not Found — SmartPick"
  });
});

export default router;

