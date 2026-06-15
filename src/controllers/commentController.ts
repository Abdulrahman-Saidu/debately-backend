import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthedRequest } from '../middleware/auth';

export const addComment = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { room_id } = req.params;
    const { content } = req.body;

    if (!content || content.trim() === '') {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }

    if (content.length > 300) {
      return res.status(400).json({ error: 'Comment cannot exceed 300 characters' });
    }

    const { data: debate, error: debateError } = await supabase
      .from('debates')
      .select('id, status')
      .eq('room_id', room_id)
      .single();

    if (debateError || !debate) {
      return res.status(404).json({ error: 'Debate not found' });
    }

    if (debate.status !== 'live') {
      return res.status(400).json({ error: 'Can only comment on live debates' });
    }

    const { data, error } = await supabase
      .from('comments')
      .insert({
        debate_id: debate.id,
        user_id: userId,
        content: content.trim(),
      })
      .select(`
        id,
        content,
        created_at,
        user_id,
        users (username, avatar_url)
      `)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to add comment' });
    }

    return res.status(201).json({ message: 'Comment added', comment: data });
  } catch (err) {
    console.error('[ADD COMMENT ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getComments = async (req: AuthedRequest, res: Response) => {
  try {
    const { room_id } = req.params;

    const { data: debate, error: debateError } = await supabase
      .from('debates')
      .select('id')
      .eq('room_id', room_id)
      .single();

    if (debateError || !debate) {
      return res.status(404).json({ error: 'Debate not found' });
    }

    const { data, error } = await supabase
      .from('comments')
      .select(`
        id,
        content,
        created_at,
        user_id,
        users (username, avatar_url)
      `)
      .eq('debate_id', debate.id)
      .order('created_at', { ascending: true });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch comments' });
    }

    return res.status(200).json({ comments: data });
  } catch (err) {
    console.error('[GET COMMENTS ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};