import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthedRequest } from '../middleware/auth';

export const getMyProfile = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({ user: data });
  } catch (err) {
    console.error('[GET PROFILE ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

    const { data, error } = await supabase
      .from('users')
      .select('id, username, avatar_url, bio, elo, rank, wins, losses, total_debates, interests, created_at')
      .eq('username', username)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({ user: data });
  } catch (err) {
    console.error('[GET USER PROFILE ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateProfile = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { username, bio, avatar_url } = req.body;

    if (username) {
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .neq('id', userId)
        .single();

      if (existing) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    const updates: Record<string, any> = {};
    if (username) updates.username = username;
    if (bio !== undefined) updates.bio = bio;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    return res.status(200).json({ message: 'Profile updated', user: data });
  } catch (err) {
    console.error('[UPDATE PROFILE ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getRecentDebates = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const limit = parseInt(req.query.limit as string) || 10;

    const { data, error } = await supabase
      .from('debates')
      .select(`
        id,
        topic,
        status,
        winner_id,
        created_at,
        ended_at,
        debater_one_id,
        debater_two_id,
        verdicts (
          debater_one_score,
          debater_two_score,
          debater_one_elo_change,
          debater_two_elo_change
        )
      `)
      .or(`debater_one_id.eq.${userId},debater_two_id.eq.${userId}`)
      .eq('status', 'completed')
      .order('ended_at', { ascending: false })
      .limit(limit);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch recent debates' });
    }

    return res.status(200).json({ debates: data });
  } catch (err) {
    console.error('[RECENT DEBATES ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};