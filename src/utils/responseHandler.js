/**
 * Centralized JSON response helpers.
 * Use these in controllers to ensure a consistent response shape.
 *
 * sendSuccess(res, data, statusCode)
 *   → { success: true, ...data }
 *
 * sendError(res, message, statusCode)
 *   → { success: false, message }
 */

export const sendSuccess = (res, data = {}, statusCode = 200) =>
  res.status(statusCode).json({ success: true, ...data });

export const sendError = (res, message = 'Something went wrong', statusCode = 500) =>
  res.status(statusCode).json({ success: false, message });
