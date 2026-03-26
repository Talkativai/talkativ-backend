import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { updateBusinessSchema, onboardingBusinessSchema } from '../validators/business.validator.js';
import * as businessController from '../controllers/business.controller.js';

const router = Router();
router.use(authenticate);

router.get('/', businessController.getBusiness);
router.put('/', validate(updateBusinessSchema), businessController.updateBusiness);
router.put('/onboarding', validate(onboardingBusinessSchema), businessController.updateOnboarding);
router.post('/complete-onboarding', businessController.completeOnboarding);

export default router;
