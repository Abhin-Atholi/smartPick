import express from "express";
const router = express.Router();
import * as accountController  from "../../controllers/user/account.controller.js";
import { protectRoute } from "../../middleware/user/isAuth.js";
import { profileUploadMiddleware } from "../../middleware/user/profileUpload.js";
import * as referralController from "../../controllers/user/referral.controller.js";
import { validateRequest } from "../../middleware/validationMiddleware.js";
import { addressSchema } from "../../validators/user/addressValidation.js";

router.use(protectRoute);

router.get("/", accountController.loadAccount);
router.put("/update-profile", profileUploadMiddleware, accountController.updateProfile);
router.delete("/remove-image", accountController.removeProfileImage);

router.get("/addresses", accountController.loadAddresses);
router.post("/addresses", validateRequest(addressSchema), accountController.addAddress);
router.put("/addresses/:id", validateRequest(addressSchema), accountController.updateAddress);
router.delete("/addresses/:id", accountController.deleteAddress);

router.get("/security", accountController.loadSecurity);
router.put("/update-password", accountController.updatePassword);

router.get("/referrals", referralController.loadReferrals);

export default router;

