import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthedRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_TURN_SECONDS = 60;
const DEFAULT_TOTAL_SECONDS = 900;

export const createRoom = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { topic, opponent_username, turn_duration_seconds, total_duration_seconds } = req.body;

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
        turn_duration_seconds:
          typeof turn_duration_seconds === 'number' ? turn_duration_seconds : DEFAULT_TURN_SECONDS,
        total_duration_seconds:
          typeof total_duration_seconds === 'number' ? total_duration_seconds : DEFAULT_TOTAL_SECONDS,
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
        current_speaker_id: debate.debater_one_id,
        turn_number: 1,
        turn_started_at: new Date().toISOString(),
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
      .select(`
        *,
        debater_one:debater_one_id ( username, avatar_url ),
        debater_two:debater_two_id ( username, avatar_url )
      `)
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
        current_speaker_id: null,
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
        current_speaker_id: debate.debater_one_id,
        turn_number: 1,
        turn_started_at: new Date().toISOString(),
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

// Turn control: only the CURRENT speaker's client may end their own turn.
// This is what makes it server-enforced rather than UI-toggled -- a client
// cannot flip whose turn it is by calling this unless the backend already
// considers them the active speaker AND their time has elapsed.
export const advanceTurn = async (req: AuthedRequest, res: Response) => {
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

    if (debate.status !== 'in_progress') {
      return res.status(400).json({ error: 'Debate is not in progress' });
    }

    if (debate.current_speaker_id !== userId) {
      return res.status(403).json({ error: 'Only the active speaker can end their turn' });
    }

    if (!debate.turn_started_at || !debate.turn_duration_seconds) {
      return res.status(400).json({ error: 'Turn has not been started' });
    }

    const turnStartedMs = new Date(debate.turn_started_at).getTime();
    const now = Date.now();
    const elapsedMs = now - turnStartedMs;
    const graceMs = 1000; // absorb client timer jitter/latency

    if (elapsedMs < debate.turn_duration_seconds * 1000 - graceMs) {
      return res.status(400).json({ error: 'Turn time has not elapsed yet' });
    }

    if (debate.total_duration_seconds && debate.started_at) {
      const debateStartedMs = new Date(debate.started_at).getTime();
      const totalElapsedMs = now - debateStartedMs;

      if (totalElapsedMs >= debate.total_duration_seconds * 1000) {
        const { data, error } = await supabase
          .from('debates')
          .update({
            status: 'completed',
            ended_at: new Date().toISOString(),
            current_speaker_id: null,
          })
          .eq('room_id', room_id)
          .select()
          .single();

        if (error) {
          console.error('[ADVANCE TURN - AUTO END ERROR]', error);
          return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({ message: 'Debate time complete', debate: data });
      }
    }

    const nextSpeakerId =
      debate.current_speaker_id === debate.debater_one_id
        ? debate.debater_two_id
        : debate.debater_one_id;

    const { data, error } = await supabase
      .from('debates')
      .update({
        current_speaker_id: nextSpeakerId,
        turn_number: (debate.turn_number ?? 0) + 1,
        turn_started_at: new Date().toISOString(),
      })
      .eq('room_id', room_id)
      .select()
      .single();

    if (error) {
      console.error('[ADVANCE TURN ERROR]', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ message: 'Turn advanced', debate: data });
  } catch (err) {
    console.error('[ADVANCE TURN ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};