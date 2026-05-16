import express from 'express';
const router = express.Router();

import * as offerController from '../../controller/admin/offerController.js';
import { validateRequest } from '../../middleware/validationMiddleware.js';
import { createOfferSchema, updateOfferSchema } from '../../validators/admin/offerValidator.js';

router.get('/', offerController.getOffers);
router.post('/add', validateRequest(createOfferSchema), offerController.addOffer);
router.patch('/edit/:id', validateRequest(updateOfferSchema), offerController.editOffer);
router.patch('/toggle/:id', offerController.toggleOffer);
router.delete('/delete/:id', offerController.deleteOffer);

export default router;
