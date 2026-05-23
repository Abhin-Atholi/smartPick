import * as productService from "../../services/admin/product.service.js";
import * as categoryService from "../../services/admin/category.service.js";
import * as subcategoryService from "../../services/admin/subcategory.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendSuccess, sendError } from "../../utils/responseHandler.js";

// ─── Listing ─────────────────────────────────────────────────────────────────

export const getProducts = asyncHandler(async (req, res) => {
    const search = req.query.search;
    const status = req.query.status;
    const categoryId = req.query.category;
    const subcategoryId = req.query.subcategory;
    const page = parseInt(req.query.page) || 1;
    const sortField = req.query.sort || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;
    const limit = 10;

    const result = await productService.getProducts({
        search, status, categoryId, subcategoryId, page, sortField, sortOrder, limit
    });

    const allCategories = await categoryService.getAllCategories();

    // Load subcategories for the currently selected category (for filter dropdown)
    let allSubcategories = [];
    if (categoryId && categoryId !== 'All') {
        allSubcategories = await subcategoryService.getSubcategoriesByParent(categoryId);
    }

    res.render("admin/products/products", {
        title: "Product Management",
        products: result.products,
        categories: allCategories,
        subcategories: allSubcategories,
        currentSearch: search || "",
        currentStatus: status || "All",
        currentCategory: categoryId || "All",
        currentSubcategory: subcategoryId || "All",
        currentSort: sortField,
        currentOrder: req.query.order || 'desc',
        currentPage: page,
        totalPages: result.totalPages,
        ...result.stats,
        activePath: "/admin/products"
    });
});

// ─── Add ─────────────────────────────────────────────────────────────────────

export const getAddProduct = asyncHandler(async (req, res) => {
    const categories = await categoryService.getAllActiveCategories();
    res.render("admin/products/add-product", {
        title: "Add Product",
        categories,
        activePath: "/admin/products"
    });
});

export const addProduct = asyncHandler(async (req, res) => {
    const { name, description, brand, category, subcategory, isActive, isFeatured, variants, colorOptions } = req.body;

    const existingProduct = await productService.checkProductExists(name);
    if (existingProduct) {
        return sendError(res, "A product with this name already exists.", 400); // Will need to adapt front-end slightly if it was checking { errors: { name: ... } } but typically it just alerts the message. Let's keep it robust.
    }

    colorOptions.forEach((col, index) => {
        const vFiles = (req.files || []).filter(f => f.fieldname === `color_images_${index}`);
        col.images = vFiles.map(f => f.path);
        delete col.newImagesCount;
        delete col.existingImages;
    });

    await productService.createProductFixed({
        name,
        description,
        brand,
        category,
        subcategory,
        colorOptions,
        variants,
        isActive,
        isFeatured
    });

    sendSuccess(res, { message: "Product created successfully!" }, 201);
});

// ─── Edit ─────────────────────────────────────────────────────────────────────

export const getEditProduct = asyncHandler(async (req, res) => {
    const product = await productService.getProductById(req.params.id);
    if (!product) return res.status(404).send("Product not found");

    const categories = await categoryService.getAllActiveCategories();
    const subcategories = product.category
        ? await subcategoryService.getSubcategoriesByParent(product.category._id)
        : [];

    res.render("admin/products/edit-product", {
        title: "Edit Product",
        product,
        categories,
        subcategories,
        activePath: "/admin/products"
    });
});

export const updateProduct = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, brand, category, subcategory, isActive, isFeatured, variants, colorOptions, removedImages } = req.body;

    colorOptions.forEach((col, index) => {
        const vFiles = (req.files || []).filter(f => f.fieldname === `color_images_${index}`);
        const newImageUrls = vFiles.map(f => f.path);
        col.images = [...(col.existingImages || []), ...newImageUrls];
        delete col.newImagesCount;
        delete col.existingImages;
    });

    const updateData = {
        name,
        description,
        brand,
        category,
        subcategory,
        colorOptions,
        variants,
        isActive,
        isFeatured
    };

    const updated = await productService.updateProduct(id, updateData, removedImages);
    if (!updated) return sendError(res, "Product not found.", 404);

    sendSuccess(res, { message: "Product updated successfully!" });
});

// ─── Toggle & Delete ─────────────────────────────────────────────────────────

export const toggleProduct = asyncHandler(async (req, res) => {
    const result = await productService.toggleProductStatus(req.params.id);

    // 1. Check if product exists
    if (!result) {
        return sendError(res, "Product not found.", 404);
    }

    // 2. Check if the service blocked the action (Parent Category/Sub-category hidden)
    if (result.blocked) {
        return sendError(res, result.message, 400);
    }

    // 3. Success case
    sendSuccess(res, { 
        message: `Product is now ${result.isActive ? 'active' : 'hidden'}.`,
        newStatus: result.isActive 
    });
});


export const toggleFeatured = asyncHandler(async (req, res) => {
    const result = await productService.toggleProductFeatured(req.params.id);

    if (!result) {
        return sendError(res, "Product not found.", 404);
    }

    // Handle blocked case (if product is hidden)
    if (result.blocked) {
        return sendError(res, result.message, 400);
    }

    sendSuccess(res, { 
        isFeatured: result.isFeatured,
        message: `Product is now ${result.isFeatured ? 'featured' : 'not featured'}.`
    });
});


export const softDeleteProduct = asyncHandler(async (req, res) => {
    const product = await productService.softDeleteProduct(req.params.id);
    if (!product) return sendError(res, "Product not found.", 404);
    sendSuccess(res, { message: "Product has been removed from the storefront." });
});

// ─── AJAX: Subcategories by Category ─────────────────────────────────────────

export const getSubcategoriesByCategory = asyncHandler(async (req, res) => {
    const subcategories = await subcategoryService.getSubcategoriesByParent(req.params.categoryId);
    sendSuccess(res, { subcategories });
});

