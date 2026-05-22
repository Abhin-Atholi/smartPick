import express from 'express';
const router = express.Router();
import * as walletController from '../../controllers/user/wallet.controller.js';
import { protectRoute } from '../../middleware/user/isAuth.js';

router.get('/wallet', protectRoute, walletController.getWalletPage);
router.post('/wallet/topup/initiate', protectRoute, walletController.initiateWalletTopup);
router.post('/wallet/topup/verify', protectRoute, walletController.verifyWalletTopup);

export default router;

