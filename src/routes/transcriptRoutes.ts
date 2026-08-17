import { Router } from 'express';
import { saveSegment, getSegments } from '../controllers/transcriptController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.post('/:room_id/segment', requireAuth, saveSegment);
router.get('/:room_id', requireAuth, getSegments);

export default router;