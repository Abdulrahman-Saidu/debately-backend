import { Router } from 'express';
import {
  createRoom,
  joinRoom,
  getLiveDebates,
  getDebateByRoomId,
  quickMatch,
  endDebate,
} from '../controllers/debateController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/live', getLiveDebates);
router.get('/:room_id', requireAuth, getDebateByRoomId);
router.post('/create', requireAuth, createRoom);
router.post('/quick-match', requireAuth, quickMatch);
router.post('/:room_id/join', requireAuth, joinRoom);
router.post('/:room_id/end', requireAuth, endDebate);

export default router;