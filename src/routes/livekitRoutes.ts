import { Router } from 'express';
import { getRoomToken } from '../controllers/livekitController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/:room_id/token', requireAuth, getRoomToken);

export default router;