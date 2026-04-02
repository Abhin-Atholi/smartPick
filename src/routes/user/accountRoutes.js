import express from "express";
const router = express.Router();
import * as accountController  from "../../controller/user/accountController.js";
import { protectRoute } from "../../middleware/user/isAuth.js";
import { profileUploadMiddleware } from "../../middleware/user/profileUpload.js";

router.use(protectRoute);

router.get("/", accountController.loadAccount);
router.put("/update-profile", profileUploadMiddleware, accountController.updateProfile);
router.delete("/remove-image", accountController.removeProfileImage);

router.get("/addresses", accountController.loadAddresses);
router.post("/addresses", accountController.addAddress);
router.put("/addresses/:id", accountController.updateAddress);
router.delete("/addresses/:id", accountController.deleteAddress);

router.get("/security", accountController.loadSecurity);
router.put("/update-password", accountController.updatePassword);

export default router;
