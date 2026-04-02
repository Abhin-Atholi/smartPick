import express from "express";
const router = express.Router();
import * as userController from "../../controller/user/userController.js";
import { checkBlocked } from "../../middleware/user/isAuth.js";

// Import Modular Routers
import authRoutes from "./authRoutes.js";
import accountRoutes from "./accountRoutes.js";
import wishlistRoutes from "./wishlistRoutes.js";
import cartRoutes from "./cartRoutes.js";
import productRoutes from "./productRoutes.js";

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

export default router;
