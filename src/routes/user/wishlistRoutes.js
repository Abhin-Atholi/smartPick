import express from "express";
const router = express.Router();
import * as wishlistController from "../../controller/user/wishlistController.js";
import { protectRoute } from "../../middleware/user/isAuth.js";

// --- Wishlist ---
router.get("/", protectRoute, wishlistController.getWishlist);
router.post("/toggle", wishlistController.toggleWishlist);
router.delete("/remove", protectRoute, wishlistController.removeFromWishlist);

export default router;
