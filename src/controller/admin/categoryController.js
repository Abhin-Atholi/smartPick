import * as categoryService from "../../services/admin/categoryService.js";

// --- Category Management Controllers ---
export const getCategories = async (req, res) => {
    try {
        const search = req.query.search;
        const status = req.query.status;
        const page = parseInt(req.query.page) || 1;
        const sortField = req.query.sort || 'createdAt';
        const sortOrder = req.query.order === 'asc' ? 1 : -1;
        const limit = 10;

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
            totalSubcategories: result.stats.totalSubcategories
        });
    } catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).send("Server Error processing categories");
    }
};

export const getAddCategory = async (req, res) => {
    // Optional standalone page fallback, but we will mostly use the modal injection over AJAX
    res.render("admin/category/category", { title: "Add Category" });
};

export const addCategory = async (req, res) => {
    try {
        const { name, description, isActive } = req.body;
        
        // Validate required fields
        if (!name || name.trim().length < 3) {
            return res.status(400).json({ success: false, message: "Category name must be at least 3 characters long." });
        }
        
        if (!description || description.trim().length < 10) {
            return res.status(400).json({ success: false, message: "Description must be at least 10 characters long." });
        }
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: "A category banner image is required." });
        }

        // Check uniqueness via Service
        const existingCategory = await categoryService.checkCategoryExists(name);
        if (existingCategory) {
            return res.status(400).json({ success: false, message: "A Category with this exact name already exists" });
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

        res.status(201).json({ success: true, message: "Category successfully created" });
    } catch (error) {
        console.error("Add category processing error:", error);
        res.status(500).json({ success: false, message: "Internal server error while creating category" });
    }
};

export const toggleCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await categoryService.toggleCategoryStatus(id);
        
        if (!category) return res.status(404).json({ success: false, message: "Category not found" });

        res.json({ success: true, newStatus: category.isActive });
    } catch (error) {
        console.error("Toggle category error:", error);
        res.status(500).json({ success: false, message: "Server error toggling visibility" });
    }
};

export const getEditCategory = async (req, res) => {
  res.send("Edit category form coming soon");
};

export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, isActive } = req.body;
        
        // Similar to Add, we enforce text bounds
        if (!name || name.trim().length < 3) {
            return res.status(400).json({ success: false, message: "Category name must be at least 3 characters long." });
        }
        console.log("categoryController/line112")
        
        if (!description || description.trim().length < 10) {
            return res.status(400).json({ success: false, message: "Description must be at least 10 characters long." });
        }
        console.log("categoryController/line117")


        // Uniqueness check, excluding THIS specific category from the check
        const existingCategory = await categoryService.checkCategoryExists(name);
        if (existingCategory && existingCategory._id.toString() !== id) {
            return res.status(400).json({ success: false, message: "Another Category with this name already exists." });
        }
        console.log("categoryController/line125")

        const updateData = {
            name: name.trim(),
            description: description.trim(),
            isActive: isActive === 'true' || isActive === 'on'
        };
        console.log("categoryController/line132")

        const updatedCategory = await categoryService.updateCategory(id, updateData, req.file);
        console.log("categoryController/line135")
        
        if (!updatedCategory) {
            return res.status(404).json({ success: false, message: "Category not found." });
        }

        res.json({ success: true, message: "Category successfully updated!" });
    } catch (error) {
        console.error("Update category processing error:", error);
        res.status(500).json({ success: false, message: "Internal server error while updating category." });
    }
};

export const deleteCategory = async (req, res) => {
  res.send("Category deleted");
};
