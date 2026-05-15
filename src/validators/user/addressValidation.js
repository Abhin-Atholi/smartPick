import Joi from 'joi';

export const addressSchema = Joi.object({
    fullName: Joi.string().trim().min(3).max(50).required().messages({
        'string.empty': 'Full name is required.',
        'string.min': 'Full name must be at least 3 characters long.',
        'string.max': 'Full name cannot exceed 50 characters.',
        'any.required': 'Full name is required.'
    }),
    phone: Joi.string().trim().pattern(/^[0-9]{10}$/).required().messages({
        'string.pattern.base': 'Phone number must be exactly 10 digits.',
        'string.empty': 'Phone number is required.',
        'any.required': 'Phone number is required.'
    }),
    pincode: Joi.string().trim().pattern(/^[0-9]{6}$/).required().messages({
        'string.pattern.base': 'Pincode must be exactly 6 digits.',
        'string.empty': 'Pincode is required.',
        'any.required': 'Pincode is required.'
    }),
    city: Joi.string().trim().required().messages({
        'string.empty': 'City is required.',
        'any.required': 'City is required.'
    }),
    state: Joi.string().trim().required().messages({
        'string.empty': 'State is required.',
        'any.required': 'State is required.'
    }),
    locality: Joi.string().trim().required().messages({
        'string.empty': 'Locality/Area is required.',
        'any.required': 'Locality/Area is required.'
    }),
    landmark: Joi.string().trim().optional().allow(''),
    addressType: Joi.string().valid('Home', 'Work', 'Other').default('Home').messages({
        'any.only': 'Address type must be Home, Work, or Other.'
    })
});
