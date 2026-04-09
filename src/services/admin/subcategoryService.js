import Subcategory from "../../model/subcategoryModel.js";
import Product from "../../model/productModel.js";
import Category from "../../model/categoryModel.js";
import { deleteCloudinaryFile } from "../../utils/fileHelper.js";

/**
 * Fetch subcategories with pagination, search, sorting, and parent filtering
 */
export const getSubcategories = async ({ search, status, parentCategory, page, sortField, sortOrder, limit }) => {
    const skip = (page - 1) * limit;
    let query = {};

    if (search) {
        query.name = { $regex: search, $options: "i" };
    }

    if (status && status !== "All") {
        query.isActive = status === "Active";
    }

    if (parentCategory && parentCategory !== "All") {
        query.parentCategory = parentCategory;
    }

    const totalDocuments = await Subcategory.countDocuments(query);
    const totalPages = Math.ceil(totalDocuments / limit) || 1;

    const sortConfig = {};
    sortConfig[sortField] = sortOrder;

    const subcategories = await Subcategory.find(query)
        .populate("parentCategory", "name")
        .sort(sortConfig)
        .skip(skip)
        .limit(limit);

    // Provide aggregation stats for the top cards
    const totalSubcategories = await Subcategory.countDocuments();
    const activeSubcategories = await Subcategory.countDocuments({ isActive: true });
    const hiddenSubcategories = await Subcategory.countDocuments({ isActive: false });

    return {
        subcategories,
        totalPages,
        stats: {
            totalSubcategories,
            activeSubcategories,
            hiddenSubcategories
        }
    };
};

/**
 * Checks if a subcategory with the given name already exists (case-insensitive)
 */
export const checkSubcategoryExists = async (name) => {
    return await Subcategory.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, "i") } });
};

/**
 * Validates and saves a new Subcategory document
 */
export const createSubcategory = async (subcategoryData) => {
    const subcategory = new Subcategory(subcategoryData);
    return await subcategory.save();
};

/**
 * Toggles a subcategory's visibility and initiates cascading visibility unlist for attached items
 */
export const toggleSubcategoryStatus = async (id) => {
    const subcategory = await Subcategory.findById(id).populate("parentCategory", "isActive");
    if (!subcategory) return null;

    if (!subcategory.isActive && subcategory.parentCategory && !subcategory.parentCategory.isActive) {
        return { blocked: true, message: "Cannot show this subcategory because its parent category is hidden." };
    }

    subcategory.isActive = !subcategory.isActive;
    await subcategory.save();

    const status = subcategory.isActive;
    // When hiding, also strip the 'isFeatured' status from products in this subcategory
    const updateData = status ? { isActive: true } : { isActive: false, isFeatured: false };
    await Product.updateMany({ subcategory: subcategory._id }, updateData);

    return subcategory;
};


/**
 * Updates a subcategory and natively handles Cloudinary file replacement logic if necessary
 */
export const updateSubcategory = async (id, updateData, newImageFile) => {
    const subcategory = await Subcategory.findById(id);
    if (!subcategory) return null;

    // Process new image upload & purge old asset
    if (newImageFile) {
        if (subcategory.image) {
            // Break down Cloudinary URL automatically:
            const parts = subcategory.image.split('/');
            const uploadIndex = parts.indexOf('upload');
            if (uploadIndex !== -1) {
                const publicIdWithFormat = parts.slice(uploadIndex + 2).join('/');
                const publicId = publicIdWithFormat.split('.')[0];
                try {
                    await deleteCloudinaryFile(publicId);
                } catch (error) {
                    console.error("Failed to purge old subcategory image:", error);
                }
            }
        }
        subcategory.image = newImageFile.path;
    }

    subcategory.name = updateData.name;
    subcategory.description = updateData.description;
    subcategory.isActive = updateData.isActive;
    subcategory.parentCategory = updateData.parentCategory;

    return await subcategory.save();
};

export const getSubcategoriesByParent = async (categoryId) => {
    return await Subcategory.find({ parentCategory: categoryId, isActive: true }).select('name _id').sort({ name: 1 });
};

export const getAllActiveSubcategories = async () => {
    return await Subcategory.find({ isActive: true }).select('name _id').sort({ name: 1 });
};
