import express from "express";
const router = express.Router();
import * as orderController from "../../controller/user/orderController.js";
import { protectRoute } from "../../middleware/user/isAuth.js";

router.use(protectRoute); // All order routes require authentication

router.get("/checkout", orderController.loadCheckout);
router.post("/order/place", orderController.placeOrder);
router.get("/order/success", orderController.loadOrderSuccess);

router.get("/orders", orderController.getOrders);
router.get("/orders/:id", orderController.getOrderDetails);
router.post("/order/cancel", orderController.cancelOrder);
router.post("/order/return", orderController.returnOrder);

export default router;
