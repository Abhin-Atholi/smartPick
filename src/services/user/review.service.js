import ProductReview from "../../model/reviewModel.js";
import Product from "../../model/productModel.js";
import Order from "../../model/orderModel.js";
import AppError from "../../utils/AppError.js";

export const calculateReviewStats = async (productId) => {
    const stats = await ProductReview.aggregate([
        { $match: { productId: productId } },
        {
            $group: {
                _id: '$productId',
                averageRating: { $avg: '$rating' },
                reviewCount: { $sum: 1 }
            }
        }
    ]);

    const breakdown = await ProductReview.aggregate([
        { $match: { productId: productId } },
        {
            $group: {
                _id: '$rating',
                count: { $sum: 1 }
            }
        }
    ]);

    const ratingBreakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    breakdown.forEach(b => {
        ratingBreakdown[b._id] = b.count;
    });

    const reviewCount = stats.length > 0 ? stats[0].reviewCount : 0;
    const averageRating = stats.length > 0 ? Number(stats[0].averageRating.toFixed(1)) : 0;

    const ratingPercentages = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    if (reviewCount > 0) {
        for (let i = 1; i <= 5; i++) {
            ratingPercentages[i] = Math.round((ratingBreakdown[i] / reviewCount) * 100);
        }
    }

    await Product.findByIdAndUpdate(productId, {
        averageRating,
        reviewCount
    });

    return {
        averageRating,
        reviewCount,
        ratingBreakdown,
        ratingPercentages
    };
};

export const canReviewProduct = async (userId, productId) => {
    // Check if review already exists
    const existingReview = await ProductReview.findOne({ userId, productId });
    if (existingReview) {
        return { eligible: false, message: "You have already reviewed this product." };
    }

    // Check if user has purchased and item is delivered
    // Allow if status is Delivered, or any of the return states (since it means they got it)
    const validStatuses = ['Delivered', 'Return Requested', 'Returned', 'Return Rejected'];
    
    const order = await Order.findOne({
        user: userId,
        items: {
            $elemMatch: {
                product: productId,
                itemStatus: { $in: validStatuses }
            }
        }
    });

    if (!order) {
        return { eligible: false, message: "You can only review products that have been delivered to you." };
    }

    return { eligible: true, orderId: order._id };
};

export const addReview = async (userId, productId, rating, reviewText) => {
    const eligibility = await canReviewProduct(userId, productId);
    if (!eligibility.eligible) {
        throw new AppError(eligibility.message);
    }

    const User = (await import("../../model/userModel.js")).default;
    const user = await User.findById(userId);
    const userNameSnapshot = user ? user.fullName.trim() : "Verified Customer";

    const review = new ProductReview({
        userId,
        productId,
        orderId: eligibility.orderId,
        rating: Number(rating),
        reviewText: reviewText?.trim(),
        userNameSnapshot
    });

    await review.save();
    await calculateReviewStats(productId);
    
    return review;
};

export const updateReview = async (userId, reviewId, rating, reviewText) => {
    const review = await ProductReview.findOne({ _id: reviewId, userId });
    if (!review) {
        throw new AppError("Review not found or unauthorized");
    }

    review.rating = Number(rating);
    review.reviewText = reviewText?.trim();
    review.isEdited = true;

    await review.save();
    await calculateReviewStats(review.productId);

    return review;
};

export const deleteReview = async (userId, reviewId) => {
    const review = await ProductReview.findOneAndDelete({ _id: reviewId, userId });
    if (!review) {
        throw new AppError("Review not found or unauthorized");
    }

    await calculateReviewStats(review.productId);
    return true;
};

export const getProductReviews = async (productId, sortBy = 'newest', page = 1, limit = 10) => {
    const skip = (page - 1) * limit;
    
    let sortQuery = { createdAt: -1 };
    if (sortBy === 'highest') sortQuery = { rating: -1, createdAt: -1 };
    if (sortBy === 'lowest') sortQuery = { rating: 1, createdAt: -1 };

    const reviews = await ProductReview.find({ productId })
        .populate('userId', 'fullName')
        .sort(sortQuery)
        .skip(skip)
        .limit(limit);

    const total = await ProductReview.countDocuments({ productId });

    const stats = await calculateReviewStats(productId);

    return {
        reviews,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        ...stats
    };
};

export const getUserReviewForProduct = async (userId, productId) => {
    if (!userId) return null;
    return await ProductReview.findOne({ userId, productId });
};
