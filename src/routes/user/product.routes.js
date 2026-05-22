import express from "express";
const router = express.Router();
import * as productsController from "../../controllers/user/product.controller.js";

// Products listing page
router.get("/", productsController.loadProducts);

// Product details page
router.get("/details/:id", productsController.loadProductDetails);

// Offers & Coupons APIs
router.get("/:id/offers", productsController.getProductOffers);
router.get("/:id/coupons", productsController.getEligibleCoupons);

export default router;

