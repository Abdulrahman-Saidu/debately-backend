import { Router } from 'express';
import { getMyProfile, getUserProfile, updateProfile, getRecentDebates, searchUsers } from '../controllers/userController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/me', requireAuth, getMyProfile);
router.get('/recent-debates', requireAuth, getRecentDebates);
router.get('/search', requireAuth, searchUsers);
router.put('/me', requireAuth, updateProfile);
router.get('/:username', getUserProfile);

export default router;