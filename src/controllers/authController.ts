import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthedRequest } from '../middleware/auth';

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
      .maybeSingle();

    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError || !authData.user) {
      return res.status(400).json({ error: authError?.message || 'Signup failed' });
    }

    const { error: profileError } = await supabase.from('users').insert({
      id: authData.user.id,
      email,
      username,
      rules_accepted: false,
      avatar_url: null,
      bio: null,
    });

    if (profileError) {
      console.error('[PROFILE INSERT ERROR]', profileError);
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({ error: profileError.message });
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData.session) {
      console.error('[POST-SIGNUP SIGNIN ERROR]', signInError);
      return res.status(500).json({ error: 'Signup succeeded but login failed' });
    }

    return res.status(201).json({
      message: 'Account created successfully',
      token: signInData.session.access_token,
      user: {
        id: authData.user.id,
        email,
        username,
        rules_accepted: false,
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
      console.error('[SIGNIN PROFILE FETCH ERROR]', profileError);
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

// Doc scope: onboarding is just the welcome / mic-camera-check / rules-explainer
// flow (3.2.3, screen 3 in the Lovable spec) -- no "interests" concept exists
// anywhere in the document, so this just flips rules_accepted.
export const completeOnboarding = async (req: AuthedRequest, res: Response) => {
  try {
    const userId = req.userId;

    const { error } = await supabase
      .from('users')
      .update({ rules_accepted: true })
      .eq('id', userId);

    if (error) {
      console.error('[ONBOARDING ERROR]', error);
      return res.status(500).json({ error: error.message });
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