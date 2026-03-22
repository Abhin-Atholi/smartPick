import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import connectDB from "./src/config/db.js";
import layouts from "express-ejs-layouts";
import { setAuthLocals } from "./src/middleware/isAuth.js";
import nocache from "nocache";
import passport from "passport";
import "./src/config/passport.js"; 
import mountRoutes from "./src/routes/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
connectDB();

// View Engine
app.set("views", path.join(__dirname, "src/views"));
app.set("view engine", "ejs");
app.use(layouts);
app.set("layout", "layout");
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
    cookie: { maxAge: 1000 * 60 * 60 * 24 } 
}));


app.use(passport.initialize());
app.use(passport.session()); // Essential for Google OAuth persistence

// Locals
app.use((req, res, next) => {
    res.locals.title = "SmartPick";
    next();
});

app.use(setAuthLocals);

mountRoutes(app);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});