import { Router } from 'express';
import { signup, signin, signout, completeOnboarding } from '../controllers/authController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/signup', signup);
router.post('/signin', signin);
router.post('/signout', requireAuth, signout);
router.post('/onboarding', requireAuth, completeOnboarding);

export default router;