import express from "express";
import session from "express-session";
import path from "path";
import helmet from "helmet";
import { fileURLToPath } from "url";
import "dotenv/config";
import connectDB from "./src/config/db.js";
import layouts from "express-ejs-layouts";
import { setAuthLocals, setCartAndWishlistLocals } from "./src/middleware/user/isAuth.js";
import nocache from "nocache";
import passport from "passport";
import "./src/config/passport.js";
import mountRoutes from "./src/routes/index.js";
import Category from "./src/model/categoryModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);

app.use(helmet({
  contentSecurityPolicy: false, // Allowed to load external CDN assets and inline scripts in EJS
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

// 🚨 SESSION MUST BE BEFORE PASSPORT & ROUTES
app.use(session({
    secret: process.env.SESSION_SECRET || "Smartpick-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
    }
}));


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

import * as orderService from "./src/services/user/orderService.js";
orderService.startStockCleanupTask();

import { globalErrorHandler } from "./src/middleware/errorHandler.js";
mountRoutes(app);

// Global Error Handler (must be after routes)
app.use(globalErrorHandler);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});