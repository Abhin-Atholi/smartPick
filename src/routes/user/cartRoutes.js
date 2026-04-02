import express from "express";
const router = express.Router();
import * as cartController from "../../controller/user/cartController.js";
import { protectRoute } from "../../middleware/user/isAuth.js";

// Cart management (AJAX focused)
router.get("/", protectRoute, cartController.loadCart);
router.post("/add", cartController.addToCart); // No protect here, controller handles guest check with better UI feedback
router.patch("/update", protectRoute, cartController.updateQuantity);
router.delete("/remove", protectRoute, cartController.removeItem);

export default router;
