import Joi from 'joi';
import { objectIdValidation } from '../common/sharedValidation.js';

// Schema for an individual color option
const colorOptionSchema = Joi.object({
    name: Joi.string().trim().required().messages({
        'string.empty': 'Color name is required.',
        'any.required': 'Color name is required.'
    }),
    code: Joi.string().trim().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/).required().messages({
        'string.pattern.base': 'Must be a valid hex color code (e.g., #FFFFFF).',
        'string.empty': 'Color code is required.',
        'any.required': 'Color code is required.'
    }),
    isDefault: Joi.boolean().default(false),
    // existingImages comes from frontend during edit
    existingImages: Joi.array().items(Joi.string().uri()).optional().default([]),
    // newImagesCount can be injected before validation to verify total images
    newImagesCount: Joi.number().integer().min(0).optional().default(0)
}).custom((value, helpers) => {
    // Validate minimum 3 images (existing + new)
    const totalImages = (value.existingImages?.length || 0) + (value.newImagesCount || 0);
    // We will bypass strict 3 image check in Joi if it's purely a new creation where files aren't mapped yet, 
    // but assuming we map newImagesCount before Joi, we can enforce it:
    if (totalImages < 3) {
        return helpers.message(`Minimum 3 images are required for color ${value.name}.`);
    }
    return value;
}, 'Color Image Count Validation');

// Schema for an individual variant
const variantSchema = Joi.object({
    size: Joi.string().valid('S', 'M', 'L', 'XL', 'XXL', 'Free Size').required().messages({
        'any.only': 'Invalid size selected.',
        'any.required': 'Size is required.'
    }),
    color: Joi.string().trim().required().messages({
        'string.empty': 'Variant color is required.',
        'any.required': 'Variant color is required.'
    }),
    price: Joi.number().positive().required().messages({
        'number.base': 'Price must be a number.',
        'number.positive': 'Price must be greater than 0.',
        'any.required': 'Price is required.'
    }),
    stock: Joi.number().integer().min(0).required().messages({
        'number.base': 'Stock must be a number.',
        'number.min': 'Stock cannot be negative.',
        'any.required': 'Stock is required.'
    }),
    sku: Joi.string().trim().optional().allow('')
});

const baseProductSchema = {
    name: Joi.string().trim().min(2).messages({
        'string.empty': 'Product name is required.',
        'string.min': 'Product name must be at least 2 characters.',
        'any.required': 'Product name is required.'
    }),
    brand: Joi.string().trim().optional().allow(''),
    category: objectIdValidation('Invalid category selection'),
    subcategory: objectIdValidation('Invalid subcategory selection').optional().allow(null, ''),
    description: Joi.string().trim().optional().allow(''),
    isActive: Joi.boolean().default(true),
    isFeatured: Joi.boolean().default(false),

    colorOptions: Joi.array().items(colorOptionSchema).min(1).custom((value, helpers) => {
        const names = value.map(c => c.name.toLowerCase());
        const uniqueNames = new Set(names);
        if (uniqueNames.size !== names.length) {
            return helpers.message('Duplicate color names are not allowed.');
        }

        const defaultColors = value.filter(c => c.isDefault);
        if (defaultColors.length !== 1) {
            return helpers.message('Exactly ONE color must be marked as default.');
        }

        return value;
    }).messages({
        'array.min': 'At least one color option is required.',
        'any.required': 'Color options are required.'
    }),

    variants: Joi.array().items(variantSchema).min(1).messages({
        'array.min': 'At least one variant is required.',
        'any.required': 'Variants are required.'
    }),

    removedImages: Joi.array().items(Joi.string().uri()).optional().default([])
};

// Cross validation function
const validateProductCrossFields = (value, helpers) => {
    if (value.colorOptions && value.variants) {
        const validColorNames = new Set(value.colorOptions.map(c => c.name.toLowerCase()));
        const variantCombos = new Set();

        for (const v of value.variants) {
            if (!validColorNames.has(v.color.toLowerCase())) {
                return helpers.message(`Variant color '${v.color}' does not exist in the defined Color Options.`);
            }

            const combo = `${v.size}-${v.color.toLowerCase()}`;
            if (variantCombos.has(combo)) {
                return helpers.message(`Duplicate variant detected: Size ${v.size} and Color ${v.color}.`);
            }
            variantCombos.add(combo);
        }
    }
    return value;
};

// For creation, everything is required
export const createProductSchema = Joi.object({
    ...baseProductSchema,
    name: baseProductSchema.name.required(),
    category: baseProductSchema.category.required(),
    colorOptions: baseProductSchema.colorOptions.required(),
    variants: baseProductSchema.variants.required()
}).custom(validateProductCrossFields, 'Product Cross Validation');

// For updates, fields can be optional
export const updateProductSchema = Joi.object({
    ...baseProductSchema,
    name: baseProductSchema.name.optional(),
    category: baseProductSchema.category.optional(),
    colorOptions: baseProductSchema.colorOptions.optional(),
    variants: baseProductSchema.variants.optional()
}).custom(validateProductCrossFields, 'Product Cross Validation');

