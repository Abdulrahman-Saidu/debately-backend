import { Router } from 'express';
import { addComment, getComments } from '../controllers/commentController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/:room_id', requireAuth, getComments);
router.post('/:room_id', requireAuth, addComment);

export default router;