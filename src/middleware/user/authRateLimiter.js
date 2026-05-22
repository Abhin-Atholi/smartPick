import rateLimit from "express-rate-limit";

// Limit login attempts (Brute-force protection)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per window
  message: {
    success: false,
    message: "Too many login attempts from this IP, please try again after 15 minutes"
  },
  skipSuccessfulRequests: true, // Do not count successful logins towards the limit
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Limit registration attempts
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 requests per hour
  message: {
    success: false,
    message: "Too many accounts created from this IP, please try again after an hour"
  },
  skipSuccessfulRequests: true, // Do not count successful registrations towards the limit
  standardHeaders: true,
  legacyHeaders: false,
});

// Limit forgot password / OTP resend
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each IP to 3 requests per 15 minutes
  message: {
    success: false,
    message: "Too many OTP requests from this IP, please try again later"
  },
  standardHeaders: true,
  legacyHeaders: false,
});

