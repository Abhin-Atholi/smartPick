import Category from "../../model/categoryModel.js";
import Subcategory from "../../model/subcategoryModel.js";
import Product from "../../model/productModel.js";
import { deleteCloudinaryFile } from "../../utils/fileHelper.js";

/**
 * Fetch categories with pagination, search, sorting and aggregation metrics
 */
export const getCategories = async ({ search, status, page, sortField, sortOrder, limit }) => {
    const skip = (page - 1) * limit;
    let query = {};

    if (search) {
        query.name = { $regex: search, $options: "i" };
    }

    if (status && status !== "All") {
        query.isActive = status === "Active";
    }

    const totalDocuments = await Category.countDocuments(query);
    const totalPages = Math.ceil(totalDocuments / limit);

    const sortConfig = {};
    sortConfig[sortField] = sortOrder;

    const categories = await Category.find(query)
        .sort(sortConfig)
        .skip(skip)
        .limit(limit);

    // Provide aggregation stats for the top cards
    const totalCategories = await Category.countDocuments();
    const activeCategories = await Category.countDocuments({ isActive: true });
    const hiddenCategories = await Category.countDocuments({ isActive: false });
    const totalSubcategories = await Subcategory.countDocuments(); 

    return {
        categories,
        totalPages,
        stats: {
            totalCategories,
            activeCategories,
            hiddenCategories,
            totalSubcategories
        }
    };
};

/**
 * Checks if a category with the given name already exists (case-insensitive)
 */
export const checkCategoryExists = async (name) => {
    return await Category.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, "i") } });
};

/**
 * Validates and saves a new Category document
 */
export const createCategory = async (categoryData) => {
    const category = new Category(categoryData);
    return await category.save();
};

/**
 * Toggles a category's visibility and initiates cascading visibility unlist for attached items
 */
export const toggleCategoryStatus = async (id) => {
    const category = await Category.findById(id);
    if (!category) return null;

    category.isActive = !category.isActive;
    await category.save();

    if (!category.isActive) {
        // Cascading unlist: Hide all child components seamlessly!
        await Subcategory.updateMany({ parentCategory: category._id }, { isActive: false });
        await Product.updateMany({ category: category._id }, { status: "inactive" });
    }

    return category;
};

/**
 * Updates a category and natively handles Cloudinary file replacement logic if necessary
 */
export const updateCategory = async (id, updateData, newImageFile) => {
    const category = await Category.findById(id);
    if (!category) return null;

    // Process new image upload & purge old asset
    if (newImageFile) {
        if (category.image) {
            // Break down Cloudinary URL automatically:
            const parts = category.image.split('/');
            const uploadIndex = parts.indexOf('upload');
            if (uploadIndex !== -1) {
                // Extracts exactly: "smartpick/categories/filename"
                const publicIdWithFormat = parts.slice(uploadIndex + 2).join('/');
                const publicId = publicIdWithFormat.split('.')[0];
                try {
                    await deleteCloudinaryFile(publicId);
                } catch (error) {
                    console.error("Non-fatal error: Failed to purge old category image:", error);
                }
            }
        }
        category.image = newImageFile.path;
    }

    category.name = updateData.name;
    category.description = updateData.description;
    category.isActive = updateData.isActive;

    return await category.save();
};
