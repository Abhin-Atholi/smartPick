import express from "express";
const router = express.Router();
import * as orderController from "../../controllers/user/order.controller.js";
import { protectRoute } from "../../middleware/user/isAuth.js";

router.use(protectRoute); // All order routes require authentication

// Checkout & post-order flow  (mounted at /orders)
router.get("/checkout", orderController.loadCheckout);    // GET /orders/checkout
router.post("/place", orderController.placeOrder);        // POST /orders/place
router.get("/success", orderController.loadOrderSuccess); // GET /orders/success

// Order listing & detail
router.get("/", orderController.getOrders);               // GET /orders
router.get("/:id", orderController.getOrderDetails);      // GET /orders/:id
router.get("/:id/view-invoice", orderController.viewInvoice);
router.get("/:id/download-invoice", orderController.downloadInvoice);

// Order actions
router.post("/cancel", orderController.cancelOrder);      // POST /orders/cancel
router.post("/return", orderController.returnOrder);      // POST /orders/return
router.get("/status/:id", orderController.checkPaymentStatus); // GET /orders/status/:id

export default router;

