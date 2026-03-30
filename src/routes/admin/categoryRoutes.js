import express from "express";
const router = express.Router();

import { isAdmin } from "../../middleware/admin/adminAuth.js";
import * as categoryController from "../../controller/admin/categoryController.js";

// Protect all routes in this file
router.use(isAdmin); 

// All routes are implicitly prefixed with "/admin/categories"
// router.get("/", categoryController.getCategories);
router.get("/add", categoryController.getAddCategory);
router.post("/add", categoryController.addCategory);
router.get("/edit/:id", categoryController.getEditCategory);
router.put("/edit/:id", categoryController.updateCategory);
router.delete("/delete/:id", categoryController.deleteCategory);
router.get("/", (req,res)=>res.render("admin/category/category",{title: 'Category Management'}));

export default router;
