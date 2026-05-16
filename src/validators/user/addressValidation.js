import Joi from 'joi';

export const addressSchema = Joi.object({
    fullName: Joi.string().trim().min(3).max(50)
        .pattern(/^(?!\d+$)(?!.*(?:[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])\1)[a-zA-Z\s'-]+$/)
        .required().messages({
            'string.empty': 'Full name is required.',
            'string.min': 'Full name must be at least 3 characters long.',
            'string.max': 'Full name cannot exceed 50 characters.',
            'string.pattern.base': 'Full name must contain letters and cannot be purely numeric or contain invalid symbols.',
            'any.required': 'Full name is required.'
        }),
    phone: Joi.string().trim().pattern(/^(?!([0-9])\1{9})[6-9][0-9]{9}$/).required().messages({
        'string.pattern.base': 'Phone number must be a valid 10-digit Indian number without repeating identical digits.',
        'string.empty': 'Phone number is required.',
        'any.required': 'Phone number is required.'
    }),
    pincode: Joi.string().trim().pattern(/^[0-9]{6}$/).required().messages({
        'string.pattern.base': 'Pincode must be exactly 6 digits.',
        'string.empty': 'Pincode is required.',
        'any.required': 'Pincode is required.'
    }),
    state: Joi.string().trim().min(2).max(50)
        .pattern(/^(?!\d+$)(?!.*[!@#$%^&*()_+=\[\]{};:"\\|.<>\/?])[a-zA-Z0-9\s'-]+$/)
        .required().messages({
            'string.empty': 'State is required.',
            'string.pattern.base': 'State cannot contain only numbers or invalid special characters.',
            'any.required': 'State is required.'
        }),
    city: Joi.string().trim().min(2).max(50)
        .pattern(/^(?!\d+$)(?!.*[!@#$%^&*()_+=\[\]{};:"\\|.<>\/?])[a-zA-Z0-9\s'-]+$/)
        .required().messages({
            'string.empty': 'City is required.',
            'string.pattern.base': 'City cannot contain only numbers or invalid special characters.',
            'any.required': 'City is required.'
        }),
    locality: Joi.string().trim().min(2).max(100)
        .pattern(/^(?!\d+$)(?!.*[!@#$%^&*()_+=\[\]{};:"\\|.<>\/?])[a-zA-Z0-9\s'-]+$/)
        .required().messages({
            'string.empty': 'Locality is required.',
            'string.pattern.base': 'Locality cannot contain only numbers or invalid special characters.',
            'any.required': 'Locality is required.'
        }),
    house: Joi.string().trim().min(1).max(100)
        .pattern(/^(?!^[^a-zA-Z0-9]+$)[a-zA-Z0-9\s,/'#-]+$/)
        .required().messages({
            'string.empty': 'House/Building is required.',
            'string.pattern.base': 'House/Building contains invalid junk characters.',
            'any.required': 'House/Building is required.'
        }),
    area: Joi.string().trim().min(2).max(150)
        .pattern(/^(?!^[^a-zA-Z0-9]+$)[a-zA-Z0-9\s,/'#-]+$/)
        .required().messages({
            'string.empty': 'Area/Street is required.',
            'string.pattern.base': 'Area/Street contains invalid junk characters.',
            'any.required': 'Area/Street is required.'
        }),
    isDefault: Joi.boolean().optional()
});
