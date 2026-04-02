import express from "express";
const router = express.Router();
import * as productsController from "../../controller/user/productsController.js";

// Products listing page
router.get("/", productsController.loadProducts);

export default router;
