import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthedRequest } from '../middleware/auth';

const MAX_SEGMENT_CHARS = 8000;

export const saveSegment = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { room_id } = req.params;
    const { turn_number, text } = req.body;

    if (typeof turn_number !== 'number' || !text || typeof text !== 'string') {
      return res.status(400).json({ error: 'turn_number and text are required' });
    }

    const { data: debate, error: debateError } = await supabase
      .from('debates')
      .select('id, debater_one_id, debater_two_id')
      .eq('room_id', room_id)
      .single();

    if (debateError || !debate) {
      return res.status(404).json({ error: 'Debate not found' });
    }

    if (debate.debater_one_id !== userId && debate.debater_two_id !== userId) {
      return res.status(403).json({ error: 'Not a participant in this debate' });
    }

    const trimmed = text.slice(0, MAX_SEGMENT_CHARS);

    const { data, error } = await supabase
      .from('transcript_segments')
      .insert({
        debate_id: debate.id,
        debater_id: userId,
        turn_number,
        text: trimmed,
      })
      .select()
      .single();

    if (error) {
      console.error('[SAVE SEGMENT ERROR]', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(201).json({ message: 'Segment saved', segment: data });
  } catch (err) {
    console.error('[SAVE SEGMENT ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// FIX: added the same participant check saveSegment already had. Without
// it, any authenticated user who knows a room_id could read that debate's
// transcript -- not just the two debaters.
export const getSegments = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { room_id } = req.params;

    const { data: debate, error: debateError } = await supabase
      .from('debates')
      .select('id, debater_one_id, debater_two_id')
      .eq('room_id', room_id)
      .single();

    if (debateError || !debate) {
      return res.status(404).json({ error: 'Debate not found' });
    }

    if (debate.debater_one_id !== userId && debate.debater_two_id !== userId) {
      return res.status(403).json({ error: 'Not a participant in this debate' });
    }

    const { data, error } = await supabase
      .from('transcript_segments')
      .select('*')
      .eq('debate_id', debate.id)
      .order('turn_number', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[GET SEGMENTS ERROR]', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ segments: data });
  } catch (err) {
    console.error('[GET SEGMENTS ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};