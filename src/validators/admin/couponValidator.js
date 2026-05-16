import Joi from 'joi';
import { PRICING_RULES } from '../../config/pricingRules.js';

/**
 * Coupon Joi Validator
 *
 * Field-level rules (here):
 *   code format/length, discountValue range, maximumDiscount
 *   conditional required, minimumAmount, usageLimit, dates, boolean.
 *
 * Cross-field rules (service layer):
 *   flat discount < minimumAmount, startDate < expiryDate,
 *   duplicate code, security lock on used coupons.
 */

const couponBaseFields = {
    description: Joi.string().trim().max(200).optional().allow('').messages({
        'string.max': 'Description cannot exceed 200 characters.'
    }),

    discountType: Joi.string().valid('flat', 'percentage').required().messages({
        'any.only': 'Discount type must be "flat" or "percentage".',
        'any.required': 'Discount type is required.'
    }),

    discountValue: Joi.when('discountType', {
        is: 'percentage',
        then: Joi.number().min(1).max(PRICING_RULES.MAX_PERCENTAGE_DISCOUNT).required().messages({
            'number.base': 'Discount value must be a number.',
            'number.min': 'Discount value must be at least 1.',
            'number.max': `Percentage discount cannot exceed ${PRICING_RULES.MAX_PERCENTAGE_DISCOUNT}%.`,
            'any.required': 'Discount value is required.'
        }),
        otherwise: Joi.number().min(1).required().messages({
            'number.base': 'Discount value must be a number.',
            'number.min': 'Discount value must be at least 1.',
            'any.required': 'Discount value is required.'
        })
    }),

    minimumAmount: Joi.number().min(0).required().messages({
        'number.base': 'Minimum amount must be a number.',
        'number.min': 'Minimum amount cannot be negative.',
        'any.required': 'Minimum purchase amount is required.'
    }),

    maximumDiscount: Joi.when('discountType', {
        is: 'percentage',
        then: Joi.number().min(1).required().messages({
            'number.base': 'Maximum discount must be a number.',
            'number.min': 'Maximum discount must be at least ₹1.',
            'any.required': 'Maximum discount is required for percentage coupons.'
        }),
        otherwise: Joi.any().optional().strip()
    }),

    usageLimit: Joi.number().integer().min(1).required().messages({
        'number.base': 'Usage limit must be a number.',
        'number.integer': 'Usage limit must be a whole number.',
        'number.min': 'Usage limit must be at least 1.',
        'any.required': 'Usage limit is required.'
    }),

    startDate: Joi.date().min(new Date().setHours(0, 0, 0, 0)).required().messages({
        'date.base': 'Invalid start date format.',
        'date.min': 'Start date cannot be in the past.',
        'any.required': 'Start date is required.'
    }),

    expiryDate: Joi.date().greater(new Date().setHours(0, 0, 0, 0)).required().messages({
        'date.base': 'Invalid expiry date format.',
        'date.greater': 'Expiry date must be today or in the future.',
        'any.required': 'Expiry date is required.'
    }),

    isActive: Joi.boolean()
        .truthy('true', 1, 'on', 'yes')
        .falsy('false', 0, 'off', 'no', '')
        .default(true)
};

const codeField = Joi.string()
    .trim()
    .uppercase()
    .min(3)
    .max(20)
    .pattern(/^(?![0-9]+$)[A-Z0-9_-]+$/)
    .messages({
        'string.empty': 'Coupon code is required.',
        'string.min': 'Code must be at least 3 characters.',
        'string.max': 'Code cannot exceed 20 characters.',
        'string.pattern.base': 'Code cannot be only numbers and must use allowed characters (A-Z, 0-9, -, _).',
        'any.required': 'Coupon code is required.'
    });

export const createCouponSchema = Joi.object({
    ...couponBaseFields,
    code: codeField.required()
});

export const updateCouponSchema = Joi.object({
    ...couponBaseFields,
    code: codeField.optional()
});
