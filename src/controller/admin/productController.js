import * as productService from "../../services/admin/productService.js";
import * as categoryService from "../../services/admin/categoryService.js";
import * as subcategoryService from "../../services/admin/subcategoryService.js";

// ─── Listing ─────────────────────────────────────────────────────────────────

export const getProducts = async (req, res) => {
    try {
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
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send("Server Error processing products");
    }
};

// ─── Add ─────────────────────────────────────────────────────────────────────

export const getAddProduct = async (req, res) => {
    try {
        const categories = await categoryService.getAllActiveCategories();
        res.render("admin/products/add-product", {
            title: "Add Product",
            categories,
            activePath: "/admin/products"
        });
    } catch (error) {
        console.error("Error loading add product page:", error);
        res.status(500).send("Server Error");
    }
};

export const addProduct = async (req, res, next) => {
    try {
        const { name, description, brand, category, subcategory, isActive, isFeatured, variants, colorOptions } = req.body;

        const existingProduct = await productService.checkProductExists(name);
        if (existingProduct) {
            return res.status(400).json({ success: false, errors: { name: "A product with this name already exists." } });
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

        res.status(201).json({ success: true, message: "Product created successfully!" });
    } catch (error) {
        next(error);
    }
};

// ─── Edit ─────────────────────────────────────────────────────────────────────

export const getEditProduct = async (req, res) => {
    try {
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
    } catch (error) {
        console.error("Error loading edit product page:", error);
        res.status(500).send("Server Error");
    }
};

export const updateProduct = async (req, res, next) => {
    try {
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
        if (!updated) return res.status(404).json({ success: false, message: "Product not found." });

        res.json({ success: true, message: "Product updated successfully!" });
    } catch (error) {
        next(error);
    }
};

// ─── Toggle & Delete ─────────────────────────────────────────────────────────

export const toggleProduct = async (req, res) => {
    try {
        const result = await productService.toggleProductStatus(req.params.id);

        // 1. Check if product exists
        if (!result) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        // 2. Check if the service blocked the action (Parent Category/Sub-category hidden)
        if (result.blocked) {
            return res.status(400).json({ 
                success: false, 
                message: result.message 
            });
        }

        // 3. Success case
        res.json({ 
            success: true, 
            message: `Product is now ${result.isActive ? 'active' : 'hidden'}.`,
            newStatus: result.isActive 
        });

    } catch (error) {
        console.error("Toggle product error:", error);
        res.status(500).json({ success: false, message: "Server error toggling product." });
    }
};


export const toggleFeatured = async (req, res) => {
    try {
        const result = await productService.toggleProductFeatured(req.params.id);

        if (!result) {
            return res.status(404).json({ success: false, message: "Product not found." });
        }

        // Handle blocked case (if product is hidden)
        if (result.blocked) {
            return res.status(400).json({ success: false, message: result.message });
        }

        res.json({ 
            success: true, 
            isFeatured: result.isFeatured,
            message: `Product is now ${result.isFeatured ? 'featured' : 'not featured'}.`
        });
    } catch (error) {
        console.error("Toggle featured error:", error);
        res.status(500).json({ success: false, message: "Server error toggling featured." });
    }
};


export const softDeleteProduct = async (req, res) => {
    try {
        const product = await productService.softDeleteProduct(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: "Product not found." });
        res.json({ success: true, message: "Product has been removed from the storefront." });
    } catch (error) {
        console.error("Soft delete product error:", error);
        res.status(500).json({ success: false, message: "Server error deleting product." });
    }
};

// ─── AJAX: Subcategories by Category ─────────────────────────────────────────

export const getSubcategoriesByCategory = async (req, res) => {
    try {
        const subcategories = await subcategoryService.getSubcategoriesByParent(req.params.categoryId);

        res.json({ success: true, subcategories });
    } catch (error) {
        console.error("Error fetching subcategories by category:", error);
        res.status(500).json({ success: false, message: "Error loading subcategories." });
    }
};
