import express from "express";
const router = express.Router();
import * as reviewController from "../../controller/user/reviewController.js";
import { protectRoute } from "../../middleware/user/isAuth.js";

// Public route to get reviews
router.get("/product/:productId", reviewController.getReviews);

// Protected routes
router.use(protectRoute);
router.get("/eligibility/:productId", reviewController.checkReviewEligibility);
router.post("/add", reviewController.addReview);
router.put("/edit/:reviewId", reviewController.updateReview);
router.delete("/delete/:reviewId", reviewController.deleteReview);

export default router;
