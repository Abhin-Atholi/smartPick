import express from "express";
const router = express.Router();
import * as productsController from "../../controller/user/productsController.js";

// Products listing page
router.get("/", productsController.loadProducts);

// Product details page
router.get("/details/:id", productsController.loadProductDetails);

export default router;
