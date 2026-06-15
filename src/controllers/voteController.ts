import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthedRequest } from '../middleware/auth';

export const castVote = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { room_id } = req.params;
    const { voted_for } = req.body;

    if (!voted_for) {
      return res.status(400).json({ error: 'voted_for is required' });
    }

    const { data: debate, error: debateError } = await supabase
      .from('debates')
      .select('id, status, debater_one_id, debater_two_id')
      .eq('room_id', room_id)
      .single();

    if (debateError || !debate) {
      return res.status(404).json({ error: 'Debate not found' });
    }

    if (debate.status !== 'live') {
      return res.status(400).json({ error: 'Can only vote on live debates' });
    }

    if (debate.debater_one_id === userId || debate.debater_two_id === userId) {
      return res.status(403).json({ error: 'Debaters cannot vote on their own debate' });
    }

    if (voted_for !== debate.debater_one_id && voted_for !== debate.debater_two_id) {
      return res.status(400).json({ error: 'Invalid voted_for value' });
    }

    const { data: existingVote } = await supabase
      .from('votes')
      .select('id')
      .eq('debate_id', debate.id)
      .eq('user_id', userId)
      .single();

    if (existingVote) {
      const { data, error } = await supabase
        .from('votes')
        .update({ voted_for })
        .eq('id', existingVote.id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to update vote' });
      }

      return res.status(200).json({ message: 'Vote updated', vote: data });
    }

    const { data, error } = await supabase
      .from('votes')
      .insert({
        debate_id: debate.id,
        user_id: userId,
        voted_for,
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to cast vote' });
    }

    return res.status(201).json({ message: 'Vote cast', vote: data });
  } catch (err) {
    console.error('[CAST VOTE ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getVotes = async (req: AuthedRequest, res: Response) => {
  try {
    const { room_id } = req.params;

    const { data: debate, error: debateError } = await supabase
      .from('debates')
      .select('id, debater_one_id, debater_two_id')
      .eq('room_id', room_id)
      .single();

    if (debateError || !debate) {
      return res.status(404).json({ error: 'Debate not found' });
    }

    const { data, error } = await supabase
      .from('votes')
      .select('voted_for')
      .eq('debate_id', debate.id);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch votes' });
    }

    const debaterOneVotes = data.filter(v => v.voted_for === debate.debater_one_id).length;
    const debaterTwoVotes = data.filter(v => v.voted_for === debate.debater_two_id).length;

    return res.status(200).json({
      total: data.length,
      debater_one_votes: debaterOneVotes,
      debater_two_votes: debaterTwoVotes,
    });
  } catch (err) {
    console.error('[GET VOTES ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};