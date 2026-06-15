import { Router } from 'express';
import { castVote, getVotes } from '../controllers/voteController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/:room_id', requireAuth, getVotes);
router.post('/:room_id', requireAuth, castVote);

export default router;