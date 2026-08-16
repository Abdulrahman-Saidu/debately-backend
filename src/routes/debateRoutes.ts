import { Router } from 'express';
import {
  createRoom,
  joinRoom,
  getDebateByRoomId,
  getOpenDebates,
  endDebate,
} from '../controllers/debateController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/live', getOpenDebates);
router.get('/:room_id', requireAuth, getDebateByRoomId);
router.post('/create', requireAuth, createRoom);
router.post('/:room_id/join', requireAuth, joinRoom);
router.post('/:room_id/end', requireAuth, endDebate);

export default router;