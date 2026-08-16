import { Router } from 'express';
import {
  createRoom,
  joinRoom,
  getDebateByRoomId,
  getOpenDebates,
  endDebate,
  getMyInvites,
  acceptInvite,
  declineInvite,
} from '../controllers/debateController';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/live', getOpenDebates);
router.get('/invites', requireAuth, getMyInvites);
router.get('/:room_id', requireAuth, getDebateByRoomId);
router.post('/create', requireAuth, createRoom);
router.post('/:room_id/join', requireAuth, joinRoom);
router.post('/:room_id/accept', requireAuth, acceptInvite);
router.post('/:room_id/decline', requireAuth, declineInvite);
router.post('/:room_id/end', requireAuth, endDebate);

export default router;