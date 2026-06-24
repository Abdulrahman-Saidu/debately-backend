import { Response } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { supabase } from '../config/supabase';
import { AuthedRequest } from '../middleware/auth';

export const getRoomToken = async (req: AuthedRequest, res: Response) => {
    try {
        const userId = req.userId;
        const room_id = req.params.room_id as string;
        const { data: debate, error } = await supabase
            .from('debates')
            .select('*')
            .eq('room_id', room_id)
            .single();

        if (error || !debate) {
            return res.status(404).json({ error: 'Debate not found' });
        }

        if (debate.status === 'completed') {
            return res.status(400).json({ error: 'Debate has ended' });
        }

        const isDebater =
            debate.debater_one_id === userId || debate.debater_two_id === userId;

        const { data: user } = await supabase
            .from('users')
            .select('username')
            .eq('id', userId)
            .single();

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const apiKey = process.env.LIVEKIT_API_KEY!;
        const apiSecret = process.env.LIVEKIT_API_SECRET!;

        const token = new AccessToken(apiKey, apiSecret, {
            identity: userId,
            name: user.username,
        });

        token.addGrant({
            roomJoin: true,
            room: room_id,
            canPublish: isDebater,
            canSubscribe: true,
            canPublishData: true,
        });

        const jwt = await token.toJwt();

        return res.status(200).json({
            token: jwt,
            url: process.env.LIVEKIT_URL,
            room_id,
            role: isDebater ? 'debater' : 'audience',
        });
    } catch (err) {
        console.error('[LIVEKIT TOKEN ERROR]', err);
        res.status(500).json({ error: 'Failed to generate room token' });
    }
};