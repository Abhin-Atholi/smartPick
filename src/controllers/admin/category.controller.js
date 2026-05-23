import * as categoryService from "../../services/admin/category.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess, sendError } from "../../utils/responseHandler.js";

// --- Category Management Controllers ---
export const getCategories = asyncHandler(async (req, res) => {
    const search = req.query.search;
    const status = req.query.status;
    const page = parseInt(req.query.page) || 1;
    const sortField = req.query.sort || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;
    const limit = 5;

    const result = await categoryService.getCategories({
        search, status, page, sortField, sortOrder, limit
    });

    res.render("admin/category/category", {
        categories: result.categories,
        title: "Category Management",
        currentSearch: search || "",
        currentStatus: status || "All",
        currentSort: sortField,
        currentOrder: req.query.order || 'desc',
        currentPage: page,
        totalPages: result.totalPages,
        // Stats blocks
        totalCategories: result.stats.totalCategories,
        activeCategories: result.stats.activeCategories,
        hiddenCategories: result.stats.hiddenCategories,
        totalSubcategories: result.stats.totalSubcategories,
        activePath: "/admin/category"
    });
});

export const addCategory = asyncHandler(async (req, res) => {
    const { name, description, isActive } = req.body;
    
    // Validate required fields
    if (!name || name.trim().length < 3) {
        return sendError(res, "Category name must be at least 3 characters long.", 400);
    }
    
    if (!description || description.trim().length < 10) {
        return sendError(res, "Description must be at least 10 characters long.", 400);
    }
    
    if (!req.file) {
        return sendError(res, "A category banner image is required.", 400);
    }

    // Check uniqueness via Service
    const existingCategory = await categoryService.checkCategoryExists(name);
    if (existingCategory) {
        return sendError(res, "A Category with this exact name already exists", 400);
    }

    let imageUrl = "";
    if (req.file) {
        imageUrl = req.file.path; // Cloudinary secure URL!
    }

    await categoryService.createCategory({
        name: name.trim(),
        description: description ? description.trim() : "",
        isActive: isActive === 'true' || isActive === 'on',
        image: imageUrl
    });

    sendSuccess(res, { message: "Category successfully created" }, 201);
});

export const toggleCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const category = await categoryService.toggleCategoryStatus(id);
    
    if (!category) return sendError(res, "Category not found", 404);

    sendSuccess(res, { newStatus: category.isActive });
});

export const updateCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, isActive } = req.body;
    
    // Similar to Add, we enforce text bounds
    if (!name || name.trim().length < 3) {
        return sendError(res, "Category name must be at least 3 characters long.", 400);
    }
    if (!description || description.trim().length < 10) {
        return sendError(res, "Description must be at least 10 characters long.", 400);
    }

    // Uniqueness check, excluding THIS specific category from the check
    const existingCategory = await categoryService.checkCategoryExists(name);
    if (existingCategory && existingCategory._id.toString() !== id) {
        return sendError(res, "Another Category with this name already exists.", 400);
    }

    const updateData = {
        name: name.trim(),
        description: description.trim(),
        isActive: isActive === 'true' || isActive === 'on'
    };

    const updatedCategory = await categoryService.updateCategory(id, updateData, req.file);
    
    if (!updatedCategory) {
        return sendError(res, "Category not found.", 404);
    }

    sendSuccess(res, { message: "Category successfully updated!" });
});



