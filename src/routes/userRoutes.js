const express= require("express") 
const router= express.Router()
const userController=require("../controller/userController")
const authController=require("../controller/authController")

const { redirectIfVerified,protectRoute, redirectIfAuth } = require("../middleware/isAuth");

router.get("/login", redirectIfAuth, authController.loadLogin);
router.get("/register", redirectIfAuth, authController.loadRegister);

router.post("/login", authController.loginUser);
router.post("/register", authController.registerUser);

router.get("/", userController.loadHome);

router.get("/home", protectRoute, userController.loadHome);
router.get("/logout", protectRoute, userController.logout);


router.get("/verify",redirectIfVerified,authController.loadVerify);
router.post("/verify",redirectIfVerified, authController.verifyOtp);

router.get("/verify", redirectIfVerified, authController.loadVerify);
router.post("/verify", redirectIfVerified, authController.verifyOtp);
router.post("/resend-otp", redirectIfVerified, authController.resendOtp);


module.exports=router