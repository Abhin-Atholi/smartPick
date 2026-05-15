import Joi from 'joi';
import mongoose from 'mongoose';

// Helper to validate MongoDB ObjectId
export const objectIdValidation = (message = 'Invalid ID format') => {
    return Joi.string().custom((value, helpers) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
            return helpers.message(message);
        }
        return value;
    }, 'ObjectId Validation');
};

// Common schema for pagination queries
export const paginationSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().trim().allow('', null).optional(),
    sort: Joi.string().trim().allow('', null).optional()
}).unknown(true);
