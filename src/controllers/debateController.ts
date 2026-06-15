import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthedRequest } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';

export const createRoom = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { topic } = req.body;

    if (!topic) {
      return res.status(400).json({ error: 'Topic is required' });
    }

    const roomId = uuidv4();

    const { data, error } = await supabase
      .from('debates')
      .insert({
        room_id: roomId,
        topic,
        debater_one_id: userId,
        debater_two_id: null,
        status: 'waiting',
        winner_id: null,
        started_at: null,
        ended_at: null,
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to create room' });
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

    if (debate.status !== 'waiting') {
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
        status: 'live',
        started_at: new Date().toISOString(),
      })
      .eq('room_id', room_id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to join room' });
    }

    return res.status(200).json({ message: 'Joined room successfully', debate: data });
  } catch (err) {
    console.error('[JOIN ROOM ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getLiveDebates = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('debates')
      .select(`
        id,
        room_id,
        topic,
        status,
        started_at,
        debater_one_id,
        debater_two_id
      `)
      .eq('status', 'live')
      .order('started_at', { ascending: false })
      .limit(20);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch live debates' });
    }

    return res.status(200).json({ debates: data });
  } catch (err) {
    console.error('[GET LIVE DEBATES ERROR]', err);
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

export const quickMatch = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;

    const { data: userProfile } = await supabase
      .from('users')
      .select('elo, interests')
      .eq('id', userId)
      .single();

    if (!userProfile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const { data: availableRooms, error } = await supabase
      .from('debates')
      .select('*')
      .eq('status', 'waiting')
      .neq('debater_one_id', userId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      return res.status(500).json({ error: 'Failed to find a match' });
    }

    if (!availableRooms || availableRooms.length === 0) {
      const roomId = uuidv4();

      const { data: newRoom, error: createError } = await supabase
        .from('debates')
        .insert({
          room_id: roomId,
          topic: 'Open Debate',
          debater_one_id: userId,
          debater_two_id: null,
          status: 'waiting',
          winner_id: null,
          started_at: null,
          ended_at: null,
        })
        .select()
        .single();

      if (createError) {
        return res.status(500).json({ error: 'Failed to create match room' });
      }

      return res.status(200).json({
        message: 'Waiting for opponent',
        status: 'waiting',
        debate: newRoom,
      });
    }

    const room = availableRooms[0];
    const sides = ['FOR', 'AGAINST'];
    const debaterOneSide = sides[Math.floor(Math.random() * 2)];
    const debaterTwoSide = debaterOneSide === 'FOR' ? 'AGAINST' : 'FOR';

    const { data: joinedRoom, error: joinError } = await supabase
      .from('debates')
      .update({
        debater_two_id: userId,
        debater_one_side: debaterOneSide,
        debater_two_side: debaterTwoSide,
        status: 'live',
        started_at: new Date().toISOString(),
      })
      .eq('room_id', room.room_id)
      .select()
      .single();

    if (joinError) {
      return res.status(500).json({ error: 'Failed to join match' });
    }

    return res.status(200).json({
      message: 'Match found',
      status: 'matched',
      debate: joinedRoom,
    });
  } catch (err) {
    console.error('[QUICK MATCH ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const endDebate = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { room_id } = req.params;
    const { winner_id } = req.body;

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

    if (debate.status !== 'live') {
      return res.status(400).json({ error: 'Debate is not live' });
    }

    const { data, error } = await supabase
      .from('debates')
      .update({
        status: 'completed',
        winner_id: winner_id || null,
        ended_at: new Date().toISOString(),
      })
      .eq('room_id', room_id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to end debate' });
    }

    return res.status(200).json({ message: 'Debate ended', debate: data });
  } catch (err) {
    console.error('[END DEBATE ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};