import express from 'express';
const router = express.Router();
import * as walletController from '../../controllers/user/wallet.controller.js';
import { protectRoute } from '../../middleware/user/isAuth.js';

// Mounted at /wallet
router.get('/', protectRoute, walletController.getWalletPage);
router.post('/topup/initiate', protectRoute, walletController.initiateWalletTopup);
router.post('/topup/verify', protectRoute, walletController.verifyWalletTopup);

export default router;

