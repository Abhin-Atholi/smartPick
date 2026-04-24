import express from "express";
const router = express.Router();
import * as orderController from "../../controller/user/orderController.js";
import { protectRoute } from "../../middleware/user/isAuth.js";

router.use(protectRoute); // All order routes require authentication

router.get("/checkout", orderController.loadCheckout);
router.post("/order/place", orderController.placeOrder);
router.get("/order/success", orderController.loadOrderSuccess);

export default router;
