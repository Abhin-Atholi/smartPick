import rateLimit from "express-rate-limit";

// Custom rate limit handler to handle both AJAX/API and traditional form submissions gracefully
const rateLimitHandler = (req, res, next, options) => {
  const isAjax = req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api');
  const message = options.message.message || "Too many requests, please try again later.";
  
  if (isAjax) {
    return res.status(options.statusCode).json({
      success: false,
      message: message
    });
  }
  
  const referer = req.get('Referrer');
  if (referer) {
    try {
      const url = new URL(referer);
      url.searchParams.set('msg', message);
      return res.redirect(url.pathname + url.search);
    } catch (e) {
      // Ignore parsing errors, fall through to fallback redirects
    }
  }
  
  // Fallback paths if Referer is missing or invalid
  if (req.path.includes('login')) {
    return res.redirect(`/login?msg=${encodeURIComponent(message)}`);
  }
  if (req.path.includes('register')) {
    return res.redirect(`/register?msg=${encodeURIComponent(message)}`);
  }
  if (req.path.includes('verify')) {
    const email = req.body.email || req.query.email || "";
    const purpose = req.body.purpose || req.query.context || "register";
    return res.redirect(`/verify?email=${encodeURIComponent(email)}&context=${encodeURIComponent(purpose)}&msg=${encodeURIComponent(message)}`);
  }
  if (req.path.includes('forgot-password')) {
    return res.redirect(`/forgot-password?msg=${encodeURIComponent(message)}`);
  }
  if (req.path.includes('reset-password') || req.path.includes('resend-reset-otp')) {
    const email = req.body.email || req.query.email || "";
    return res.redirect(`/reset-password?email=${encodeURIComponent(email)}&msg=${encodeURIComponent(message)}`);
  }

  res.status(options.statusCode).render('error', {
    title: 'Too Many Requests — SmartPick',
    message: message
  });
};

// Limit login attempts (Brute-force protection)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per window
  message: {
    success: false,
    message: "Too many login attempts from this IP, please try again after 15 minutes"
  },
  skipSuccessfulRequests: true, // Do not count successful logins towards the limit
  requestWasSuccessful: (req, res) => {
    const location = res.getHeader("Location");
    if (res.statusCode === 302 && location) {
      return location.includes("/home");
    }
    return res.statusCode < 400;
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: rateLimitHandler
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
  requestWasSuccessful: (req, res) => {
    const location = res.getHeader("Location");
    if (res.statusCode === 302 && location) {
      return !location.includes("/register");
    }
    return res.statusCode < 400;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler
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
  handler: rateLimitHandler
});


