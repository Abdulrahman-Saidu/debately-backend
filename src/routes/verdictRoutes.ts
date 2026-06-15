import { Router } from 'express';
import { generateVerdict, getVerdict } from '../controllers/verdictController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/:room_id/generate', requireAuth, generateVerdict);
router.get('/:debate_id', requireAuth, getVerdict);

export default router;