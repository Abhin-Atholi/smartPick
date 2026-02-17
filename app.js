const express= require("express")
const app= express()
const session=require("express-session")
const path=require("path")
const connectDB=require("./src/config/db")
const env=require("dotenv").config()
const userRoutes=require("./src/routes/userRoutes")
const layouts = require("express-ejs-layouts");
const {setAuthLocals}=require("./src/middleware/isAuth")
const nocache=require("nocache")


// 1. Database and Config
connectDB();

// 2. View Engine and Static Files
app.set("views", path.join(__dirname, "src/views"));
app.set("view engine", "ejs");
app.use(layouts);
app.set("layout", "layout");
app.use(express.static(path.join(__dirname, "src/public")));

// 3. BODY PARSING (Must come BEFORE routes)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(nocache())
// 4. Routes
app.use((req,res,next)=>{
    res.locals.title="SmartPick"
    next()
})
app.use(session({
    secret:"Smartpick-secret",
    resave:false,
    saveUninitialized:false,
    cookie:{ maxAge: 1000 * 60 * 60 * 24 } 
}))
app.use(setAuthLocals)

app.use("/", userRoutes);

// 5. Server Start
app.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT}`);
});
