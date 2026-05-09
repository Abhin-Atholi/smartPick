import express from 'express';
const router = express.Router();
import * as orderController from '../../controller/admin/orderController.js';

router.get("/", orderController.getOrders);
router.get("/return-requests", orderController.getReturnRequests);
router.get("/:id", orderController.getOrderDetails);
router.patch("/:id/status", orderController.updateStatus);
router.patch("/:id/cancel-item", orderController.cancelItem);
router.post("/:id/return-decision", orderController.handleReturn);
router.get("/:id/view-invoice", orderController.viewInvoice);
router.get("/:id/download-invoice", orderController.downloadInvoice);

export default router;
