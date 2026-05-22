import * as reviewService from "../../services/user/review.service.js";

export const addReview = async (req, res) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { productId, rating, reviewText } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: "Valid rating between 1 and 5 is required." });
        }

        await reviewService.addReview(userId, productId, rating, reviewText?.trim());
        
        return res.status(200).json({ success: true, message: "Review added successfully!" });
    } catch (error) {
        console.error("addReview Error:", error);
        return res.status(400).json({ success: false, message: error.message || "Failed to add review." });
    }
};

export const updateReview = async (req, res) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { reviewId } = req.params;
        const { rating, reviewText } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: "Valid rating between 1 and 5 is required." });
        }

        await reviewService.updateReview(userId, reviewId, rating, reviewText?.trim());
        
        return res.status(200).json({ success: true, message: "Review updated successfully!" });
    } catch (error) {
        console.error("updateReview Error:", error);
        return res.status(400).json({ success: false, message: error.message || "Failed to update review." });
    }
};

export const deleteReview = async (req, res) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { reviewId } = req.params;

        await reviewService.deleteReview(userId, reviewId);
        
        return res.status(200).json({ success: true, message: "Review deleted successfully!" });
    } catch (error) {
        console.error("deleteReview Error:", error);
        return res.status(400).json({ success: false, message: error.message || "Failed to delete review." });
    }
};

export const getReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        const { sortBy = 'newest', page = 1 } = req.query;

        const data = await reviewService.getProductReviews(productId, sortBy, parseInt(page), 10);
        
        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error("getReviews Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

export const checkReviewEligibility = async (req, res) => {
    try {
        const userId = req.currentUser?._id || req.session?.user?._id;
        const { productId } = req.params;

        if (!userId) {
            return res.status(200).json({ success: true, eligible: false, message: "Not logged in" });
        }

        const eligibility = await reviewService.canReviewProduct(userId, productId);
        
        return res.status(200).json({ success: true, eligible: eligibility.eligible, message: eligibility.message });
    } catch (error) {
        console.error("checkReviewEligibility Error:", error);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
};

