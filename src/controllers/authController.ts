import { Request, Response } from 'express';
import { supabase } from '../config/supabase';

const getRankFromElo = (elo: number): string => {
  if (elo < 1000) return 'Pawn';
  if (elo < 1200) return 'Knight';
  if (elo < 1400) return 'Bishop';
  if (elo < 1600) return 'Rook';
  if (elo < 1800) return 'Queen';
  if (elo < 2000) return 'King';
  if (elo < 2200) return 'Champion';
  return 'Grandmaster';
};

export const signup = async (req: Request, res: Response) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Email, password and username are required' });
    }

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return res.status(400).json({ error: authError?.message || 'Signup failed' });
    }

    const { error: profileError } = await supabase.from('users').insert({
      id: authData.user.id,
      email,
      username,
      elo: 1200,
      rank: 'Pawn',
      wins: 0,
      losses: 0,
      total_debates: 0,
      interests: [],
      rules_accepted: false,
      avatar_url: null,
      bio: null,
    });

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: 'Failed to create user profile' });
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData.session) {
      return res.status(500).json({ error: 'Signup succeeded but login failed' });
    }

    return res.status(201).json({
      message: 'Account created successfully',
      token: signInData.session.access_token,
      user: {
        id: authData.user.id,
        email,
        username,
        elo: 1200,
        rank: 'Pawn',
        rules_accepted: false,
        interests: [],
      },
    });
  } catch (err) {
    console.error('[SIGNUP ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const signin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    return res.status(200).json({
      message: 'Signed in successfully',
      token: data.session.access_token,
      user: profile,
    });
  } catch (err) {
    console.error('[SIGNIN ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const completeOnboarding = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { interests } = req.body;

    if (!interests || !Array.isArray(interests) || interests.length === 0) {
      return res.status(400).json({ error: 'At least one interest is required' });
    }

    const { error } = await supabase
      .from('users')
      .update({
        interests,
        rules_accepted: true,
      })
      .eq('id', userId);

    if (error) {
      return res.status(500).json({ error: 'Failed to complete onboarding' });
    }

    return res.status(200).json({ message: 'Onboarding completed successfully' });
  } catch (err) {
    console.error('[ONBOARDING ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const signout = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (token) {
      await supabase.auth.admin.signOut(token);
    }

    return res.status(200).json({ message: 'Signed out successfully' });
  } catch (err) {
    console.error('[SIGNOUT ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};