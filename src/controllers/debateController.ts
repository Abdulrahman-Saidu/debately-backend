import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthedRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

export const createRoom = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { topic, opponent_username } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    let debaterTwoId: string | null = null;
    let status: 'open' | 'pending_invite' = 'open';

    if (opponent_username) {
      const { data: opponent, error: opponentError } = await supabase
        .from('users')
        .select('id')
        .eq('username', opponent_username)
        .maybeSingle();

      if (opponentError || !opponent) {
        return res.status(404).json({ error: 'Opponent not found' });
      }

      if (opponent.id === userId) {
        return res.status(400).json({ error: 'You cannot invite yourself' });
      }

      debaterTwoId = opponent.id;
      status = 'pending_invite';
    }

    const roomId = uuidv4();

    const { data, error } = await supabase
      .from('debates')
      .insert({
        room_id: roomId,
        topic,
        creator_id: userId,
        debater_one_id: userId,
        debater_two_id: debaterTwoId,
        status,
        started_at: null,
        ended_at: null,
      })
      .select()
      .single();

    if (error) {
      console.error('[CREATE ROOM ERROR]', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({ message: 'Room created', debate: data });
  } catch (err) {
    console.error('[CREATE ROOM ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const joinRoom = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { room_id } = req.params;

    const { data: debate, error: fetchError } = await supabase
      .from('debates')
      .select('*')
      .eq('room_id', room_id)
      .single();

    if (fetchError || !debate) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (debate.status !== 'open') {
      return res.status(400).json({ error: 'Room is no longer available' });
    }

    if (debate.debater_one_id === userId) {
      return res.status(400).json({ error: 'You cannot join your own room' });
    }

    const sides = ['FOR', 'AGAINST'];
    const debaterOneSide = sides[Math.floor(Math.random() * 2)];
    const debaterTwoSide = debaterOneSide === 'FOR' ? 'AGAINST' : 'FOR';

    const { data, error } = await supabase
      .from('debates')
      .update({
        debater_two_id: userId,
        debater_one_side: debaterOneSide,
        debater_two_side: debaterTwoSide,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .eq('room_id', room_id)
      .select()
      .single();

    if (error) {
      console.error('[JOIN ROOM ERROR]', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ message: 'Joined room successfully', debate: data });
  } catch (err) {
    console.error('[JOIN ROOM ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Doc 3.2.3 / 3.3.4: dashboard lists open, publicly listed debate topics.
export const getOpenDebates = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('debates')
      .select(`
        id,
        room_id,
        topic,
        status,
        created_at,
        creator_id,
        debater_one_id
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[GET OPEN DEBATES ERROR]', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ debates: data });
  } catch (err) {
    console.error('[GET OPEN DEBATES ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDebateByRoomId = async (req: AuthedRequest, res: Response) => {
  try {
    const { room_id } = req.params;

    const { data, error } = await supabase
      .from('debates')
      .select('*')
      .eq('room_id', room_id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Debate not found' });
    }

    return res.status(200).json({ debate: data });
  } catch (err) {
    console.error('[GET DEBATE ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Doc scope: a debate ends when the session concludes (time expires / both
// turns complete) and transitions straight to AI verdict generation -- there
// is no manually-declared winner_id here. The winner is decided by the AI
// verdict module and stored on the verdicts table, not this one.
export const endDebate = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { room_id } = req.params;

    const { data: debate, error: fetchError } = await supabase
      .from('debates')
      .select('*')
      .eq('room_id', room_id)
      .single();

    if (fetchError || !debate) {
      return res.status(404).json({ error: 'Debate not found' });
    }

    if (debate.debater_one_id !== userId && debate.debater_two_id !== userId) {
      return res.status(403).json({ error: 'Not authorized to end this debate' });
    }

    if (debate.status !== 'in_progress') {
      return res.status(400).json({ error: 'Debate is not in progress' });
    }

    const { data, error } = await supabase
      .from('debates')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
      })
      .eq('room_id', room_id)
      .select()
      .single();

    if (error) {
      console.error('[END DEBATE ERROR]', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ message: 'Debate ended', debate: data });
  } catch (err) {
    console.error('[END DEBATE ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Doc extension: invites are pending debates where the current user is
// debater_two. Listed separately from the open list so the dashboard can
// show "X invited you" rather than mixing them into the public feed.
export const getMyInvites = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;

    const { data, error } = await supabase
      .from('debates')
      .select(`
        id,
        room_id,
        topic,
        status,
        created_at,
        debater_one_id,
        users:debater_one_id ( username, avatar_url )
      `)
      .eq('debater_two_id', userId)
      .eq('status', 'pending_invite')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET INVITES ERROR]', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ invites: data });
  } catch (err) {
    console.error('[GET INVITES ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const acceptInvite = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { room_id } = req.params;

    const { data: debate, error: fetchError } = await supabase
      .from('debates')
      .select('*')
      .eq('room_id', room_id)
      .single();

    if (fetchError || !debate) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    if (debate.debater_two_id !== userId) {
      return res.status(403).json({ error: 'This invite is not addressed to you' });
    }

    if (debate.status !== 'pending_invite') {
      return res.status(400).json({ error: 'This invite is no longer available' });
    }

    const sides = ['FOR', 'AGAINST'];
    const debaterOneSide = sides[Math.floor(Math.random() * 2)];
    const debaterTwoSide = debaterOneSide === 'FOR' ? 'AGAINST' : 'FOR';

    const { data, error } = await supabase
      .from('debates')
      .update({
        debater_one_side: debaterOneSide,
        debater_two_side: debaterTwoSide,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .eq('room_id', room_id)
      .select()
      .single();

    if (error) {
      console.error('[ACCEPT INVITE ERROR]', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ message: 'Invite accepted', debate: data });
  } catch (err) {
    console.error('[ACCEPT INVITE ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const declineInvite = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { room_id } = req.params;

    const { data: debate, error: fetchError } = await supabase
      .from('debates')
      .select('*')
      .eq('room_id', room_id)
      .single();

    if (fetchError || !debate) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    if (debate.debater_two_id !== userId) {
      return res.status(403).json({ error: 'This invite is not addressed to you' });
    }

    if (debate.status !== 'pending_invite') {
      return res.status(400).json({ error: 'This invite is no longer available' });
    }

    const { data, error } = await supabase
      .from('debates')
      .update({ status: 'declined' })
      .eq('room_id', room_id)
      .select()
      .single();

    if (error) {
      console.error('[DECLINE INVITE ERROR]', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ message: 'Invite declined', debate: data });
  } catch (err) {
    console.error('[DECLINE INVITE ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};