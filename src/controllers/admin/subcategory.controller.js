import * as subcategoryService from "../../services/admin/subcategory.service.js";
import * as categoryService from "../../services/admin/category.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess, sendError } from "../../utils/responseHandler.js";

// --- Subcategory Management Controllers ---

export const getSubcategories = asyncHandler(async (req, res) => {
    const search = req.query.search;
    const status = req.query.status;
    const parentCategory = req.query.parentCategory; // Filter by parent logic
    const page = parseInt(req.query.page) || 1;
    const sortField = req.query.sort || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;
    const limit = 5 ;

    const result = await subcategoryService.getSubcategories({
        search, status, parentCategory, page, sortField, sortOrder, limit
    });

    // Also fetch active Categories precisely for the Dropdown Population inside Modals and Table Filters!
    const activeCategories = await categoryService.getAllCategories();

    res.render("admin/category/subcategory", {
        subcategories: result.subcategories,
        title: "Subcategory Management",
        currentSearch: search || "",
        currentStatus: status || "All",
        currentParent: parentCategory || "All",
        currentSort: sortField,
        currentOrder: req.query.order || 'desc',
        currentPage: page,
        totalPages: result.totalPages,
        // Pre-pass active categories for Modals:
        categories: activeCategories,
        // Stats blocks
        totalSubcategories: result.stats.totalSubcategories,
        activeSubcategories: result.stats.activeSubcategories,
        hiddenSubcategories: result.stats.hiddenSubcategories,
        activePath: "/admin/subcategory"
    });
});



export const addSubcategory = asyncHandler(async (req, res) => {
    const { name, parentCategory, description, isActive } = req.body;
    
    // Validate required fields
    if (!name || name.trim().length < 3) {
        return sendError(res, "Subcategory name must be at least 3 characters long.", 400);
    }
    
    if (!parentCategory) {
        return sendError(res, "A Parent Category must be selected.", 400);
    }

    if (!description || description.trim().length < 10) {
        return sendError(res, "Description must be at least 10 characters long.", 400);
    }
    
    if (!req.file) {
        return sendError(res, "A subcategory image is required.", 400);
    }

    // Check uniqueness via Service
    const existingSubcategory = await subcategoryService.checkSubcategoryExists(name);
    if (existingSubcategory) {
        return sendError(res, "A Subcategory with this exact name already exists", 400);
    }

    let imageUrl = "";
    if (req.file) {
        imageUrl = req.file.path; // Cloudinary secure URL
    }

    await subcategoryService.createSubcategory({
        name: name.trim(),
        parentCategory: parentCategory,
        description: description ? description.trim() : "",
        isActive: isActive === 'true' || isActive === 'on',
        image: imageUrl
    });

    sendSuccess(res, { message: "Subcategory successfully created!" }, 201);
});

export const toggleSubcategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await subcategoryService.toggleSubcategoryStatus(id);
    
    if (!result) return sendError(res, "Subcategory not found", 404);

    // Service returned a blocked sentinel — parent category is hidden
    if (result.blocked) {
        return sendError(res, result.message, 400);
    }

    sendSuccess(res, { newStatus: result.isActive });
});


export const updateSubcategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, parentCategory, description, isActive } = req.body;
    
    // Validation bound tests
    if (!name || name.trim().length < 3) {
        return sendError(res, "Subcategory name must be at least 3 characters long.", 400);
    }
    
    if (!parentCategory) {
        return sendError(res, "Parent Category constraint error. Missing Parent!", 400);
    }

    if (!description || description.trim().length < 10) {
        return sendError(res, "Description must be at least 10 characters long.", 400);
    }

    // Uniqueness check, excluding THIS specific subcategory
    const existingSubcategory = await subcategoryService.checkSubcategoryExists(name);
    if (existingSubcategory && existingSubcategory._id.toString() !== id) {
        return sendError(res, "Another Subcategory with this name already exists.", 400);
    }

    const updateData = {
        name: name.trim(),
        parentCategory: parentCategory,
        description: description.trim(),
        isActive: isActive === 'true' || isActive === 'on'
    };

    const updatedSubcategory = await subcategoryService.updateSubcategory(id, updateData, req.file);
    
    if (!updatedSubcategory) {
        return sendError(res, "Subcategory not found.", 404);
    }

    sendSuccess(res, { message: "Subcategory successfully updated!" });
});

