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

