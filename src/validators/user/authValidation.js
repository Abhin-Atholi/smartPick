import Joi from "joi";

const nameRule = Joi.string()
  .trim()
  .min(2)
  .max(50)
  .pattern(/^(?!\s)(?!.*\s{2,})[a-zA-Z\s]+(?<!\s)$/)
  .messages({
    "string.min": "Name must be at least 2 characters",
    "string.max": "Name cannot exceed 50 characters",
    "string.pattern.base": "Name must contain only alphabets and spaces, without multiple consecutive spaces"
  });

const emailRule = Joi.string()
  .trim()
  .lowercase()
  .email({ tlds: { allow: false } }) // valid RFC email format basic
  .required()
  .messages({
    "string.email": "Please enter a valid email address",
    "any.required": "Email is required"
  });

const passwordRule = Joi.string()
  .min(8)
  .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;':",./<>?])[^\s]{8,}$/)
  .required()
  .messages({
    "string.min": "Password must be at least 8 characters",
    "string.pattern.base": "Password must contain at least 1 uppercase, 1 lowercase, 1 number, 1 special character, and no spaces",
    "any.required": "Password is required"
  });

export const registerSchema = Joi.object({
  name: nameRule.required().messages({ "any.required": "Name is required" }),
  email: emailRule,
  password: passwordRule,
  confirmPassword: Joi.any()
    .valid(Joi.ref("password"))
    .required()
    .messages({
      "any.only": "Passwords do not match",
      "any.required": "Confirm Password is required"
    }),
  referralCode: Joi.string().trim().allow("").optional()
});

export const loginSchema = Joi.object({
  email: emailRule,
  password: Joi.string().trim().min(1).required().messages({
    "string.empty": "Password is required",
    "any.required": "Password is required"
  })
});

export const resetPasswordSchema = Joi.object({
  email: emailRule,
  password: passwordRule,
  confirmPassword: Joi.any()
    .valid(Joi.ref("password"))
    .required()
    .messages({
      "any.only": "Passwords do not match",
      "any.required": "Confirm Password is required"
    }),
  otp: Joi.string().optional()
});
