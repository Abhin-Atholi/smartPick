import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import cookieParser from "cookie-parser";
import { doubleCsrf } from "csrf-csrf";
import path from "path";
import helmet from "helmet";
import { fileURLToPath } from "url";
import "dotenv/config";
// Validate required environment variables before server startup
import "./src/config/envCheck.js";
import connectDB from "./src/config/db.js";
import layouts from "express-ejs-layouts";
import { setAuthLocals, setCartAndWishlistLocals } from "./src/middleware/user/isAuth.js";
import nocache from "nocache";
import passport from "passport";
import "./src/config/passport.js";
import mountRoutes from "./src/routes/index.js";
import Category from "./src/model/categoryModel.js";

import compression from "compression";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(compression());

app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: false, // Allowed to load external CDN assets and inline scripts in EJS
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
}));

connectDB();

// View Engine
app.set("views", path.join(__dirname, "src/views"));
app.set("view engine", "ejs");
app.use(layouts);
app.set("layout", "layout/layout");
app.use(express.static(path.join(__dirname, "public")));

// Body Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(nocache());

app.use(cookieParser(process.env.SESSION_SECRET || "Smartpick-cookie-secret"));

const {
    doubleCsrfProtection,
    generateCsrfToken: generateToken,
} = doubleCsrf({
    getSecret: () => process.env.SESSION_SECRET || "Smartpick-csrf-secret",
    cookieName: process.env.NODE_ENV === "production" ? "__Host-psifi.x-csrf-token" : "psifi.x-csrf-token",
    cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
    },
    size: 64,
    ignoredMethods: ["GET", "HEAD", "OPTIONS"],
    getSessionIdentifier: () => "anonymous",
    getTokenFromRequest: (req) => req.headers["x-csrf-token"] || req.body?._csrf,
});


// 🚨 SESSION MUST BE BEFORE PASSPORT & ROUTES
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        ttl: 14 * 24 * 60 * 60 // 14 days
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
    }
}));


app.use((req, res, next) => {
    if (req.path.startsWith('/payment/webhook') || req.path.startsWith('/api/webhooks')) {
        return next();
    }
    doubleCsrfProtection(req, res, next);
});

app.use((req, res, next) => {
    // Skip token generation for background AJAX requests to prevent cookie overwrites
    if (!req.path.startsWith('/api') && !req.path.startsWith('/auth/check-email')) {
        res.locals.csrfToken = generateToken(req, res);
    }
    next();
});

app.use(passport.initialize());
app.use(passport.session()); // Essential for Google OAuth persistence

// Locals
app.use((req, res, next) => {
    res.locals.title = "SmartPick";
    res.locals.currentPath = req.originalUrl; // full URL incl. query string — used for active-state navbar/drawer
    next();
});

app.use(setAuthLocals);
app.use(setCartAndWishlistLocals);

// Inject active categories into every view (used by navbar)
app.use(async (req, res, next) => {
  try {
    res.locals.categories = await Category.find({ isActive: true }).select("name image").lean();
  } catch (err) {
    res.locals.categories = [];
  }
  next();
});

import { SHIPPING_RULES } from "./src/config/storeConfig.js";
import { PRODUCT_SIZES } from "./src/config/productConstants.js";
app.use((req, res, next) => {
  res.locals.SHIPPING_RULES = SHIPPING_RULES;
  res.locals.PRODUCT_SIZES = PRODUCT_SIZES;
  next();
});

import * as orderService from "./src/services/user/order.service.js";
orderService.startStockCleanupTask();

import { globalErrorHandler } from "./src/middleware/errorHandler.js";
mountRoutes(app);

// 404 Handler for Unmatched Routes
app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/admin')) {
        return res.status(404).render('admin/error/404', { title: 'Admin - Page Not Found' });
    }
    return res.status(404).render('user/error/404', { title: 'Page Not Found — SmartPick' });
});

// Global Error Handler (must be after routes and 404)
app.use(globalErrorHandler);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
