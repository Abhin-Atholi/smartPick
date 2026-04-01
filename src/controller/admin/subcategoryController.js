import * as subcategoryService from "../../services/admin/subcategoryService.js";
import Category from "../../model/categoryModel.js";

// --- Subcategory Management Controllers ---

export const getSubcategories = async (req, res) => {
    try {
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
        const activeCategories = await Category.find({}).select('name _id').sort({ name: 1 });

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
            hiddenSubcategories: result.stats.hiddenSubcategories
        });
    } catch (error) {
        console.error("Error fetching subcategories:", error);
        res.status(500).send("Server Error processing subcategories");
    }
};



export const addSubcategory = async (req, res) => {
    try {
        const { name, parentCategory, description, isActive } = req.body;
        
        // Validate required fields
        if (!name || name.trim().length < 3) {
            return res.status(400).json({ success: false, message: "Subcategory name must be at least 3 characters long." });
        }
        
        if (!parentCategory) {
            return res.status(400).json({ success: false, message: "A Parent Category must be selected." });
        }

        if (!description || description.trim().length < 10) {
            return res.status(400).json({ success: false, message: "Description must be at least 10 characters long." });
        }
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: "A subcategory image is required." });
        }

        // Check uniqueness via Service
        const existingSubcategory = await subcategoryService.checkSubcategoryExists(name);
        if (existingSubcategory) {
            return res.status(400).json({ success: false, message: "A Subcategory with this exact name already exists" });
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

        res.status(201).json({ success: true, message: "Subcategory successfully created!" });
    } catch (error) {
        console.error("Add subcategory processing error:", error);
        res.status(500).json({ success: false, message: "Internal server error while creating subcategory" });
    }
};

export const toggleSubcategory = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await subcategoryService.toggleSubcategoryStatus(id);
        
        if (!result) return res.status(404).json({ success: false, message: "Subcategory not found" });

        // Service returned a blocked sentinel — parent category is hidden
        if (result.blocked) {
            return res.status(400).json({ success: false, message: result.message });
        }

        res.json({ success: true, newStatus: result.isActive });
    } catch (error) {
        console.error("Toggle subcategory error:", error);
        res.status(500).json({ success: false, message: "Server error toggling visibility" });
    }
};


export const updateSubcategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, parentCategory, description, isActive } = req.body;
        
        // Validation bound tests
        if (!name || name.trim().length < 3) {
            return res.status(400).json({ success: false, message: "Subcategory name must be at least 3 characters long." });
        }
        
        if (!parentCategory) {
            return res.status(400).json({ success: false, message: "Parent Category constraint error. Missing Parent!" });
        }

        if (!description || description.trim().length < 10) {
            return res.status(400).json({ success: false, message: "Description must be at least 10 characters long." });
        }

        // Uniqueness check, excluding THIS specific subcategory
        const existingSubcategory = await subcategoryService.checkSubcategoryExists(name);
        if (existingSubcategory && existingSubcategory._id.toString() !== id) {
            return res.status(400).json({ success: false, message: "Another Subcategory with this name already exists." });
        }

        const updateData = {
            name: name.trim(),
            parentCategory: parentCategory,
            description: description.trim(),
            isActive: isActive === 'true' || isActive === 'on'
        };

        const updatedSubcategory = await subcategoryService.updateSubcategory(id, updateData, req.file);
        
        if (!updatedSubcategory) {
            return res.status(404).json({ success: false, message: "Subcategory not found." });
        }

        res.json({ success: true, message: "Subcategory successfully updated!" });
    } catch (error) {
        console.error("Update subcategory processing error:", error);
        res.status(500).json({ success: false, message: "Internal server error while updating subcategory." });
    }
};
