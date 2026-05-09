import express from 'express';
const router = express.Router();
import * as offerController from '../../controller/admin/offerController.js';

router.get('/', offerController.getOffers);
router.post('/add', offerController.addOffer);
router.patch('/edit/:id', offerController.editOffer);
router.patch('/toggle/:id', offerController.toggleOffer);
router.delete('/delete/:id', offerController.deleteOffer);

export default router;
