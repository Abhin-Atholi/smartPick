import Joi from 'joi';
import mongoose from 'mongoose';
import { PRICING_RULES } from '../../config/pricingRules.js';

/**
 * Offer Joi Validator
 *
 * Field-level rules (here):
 *   name, description, offerType, applicableTo (ObjectId),
 *   discountType, discountValue (with 90% cap), dates, boolean.
 *
 * Cross-field / business rules (service layer):
 *   startDate < expiryDate, duplicate active offer overlap,
 *   target entity existence check.
 */

const objectIdField = Joi.string()
    .custom((value, helpers) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
            return helpers.message('Invalid selection. Please choose a valid product or category.');
        }
        return value;
    }, 'ObjectId Validation');

const offerBaseFields = {
    name: Joi.string().trim().min(2).max(100).pattern(/^(?![0-9]+$).*$/).required().messages({
        'string.empty': 'Offer name is required.',
        'string.min': 'Offer name must be at least 2 characters.',
        'string.max': 'Offer name cannot exceed 100 characters.',
        'string.pattern.base': 'Offer name cannot be only numbers.',
        'any.required': 'Offer name is required.'
    }),

    description: Joi.string().trim().max(200).optional().allow('').messages({
        'string.max': 'Description cannot exceed 200 characters.'
    }),

    offerType: Joi.string().valid('product', 'category').required().messages({
        'any.only': 'Offer type must be "product" or "category".',
        'any.required': 'Offer type is required.'
    }),

    applicableTo: objectIdField.required().messages({
        'string.empty': 'Please select a product or category.',
        'any.required': 'A target product or category must be selected.'
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

    maximumDiscountAmount: Joi.when('discountType', {
        is: 'percentage',
        then: Joi.number().min(1).required().messages({
            'number.base': 'Maximum discount must be a number.',
            'number.min': 'Maximum discount must be at least ₹1.',
            'any.required': 'Maximum discount is required for percentage offers.'
        }),
        otherwise: Joi.any().optional().strip()
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

export const createOfferSchema = Joi.object(offerBaseFields);
export const updateOfferSchema = Joi.object(offerBaseFields);
