import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

export interface AuthedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export const requireAuth = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    const token = authHeader.split(' ')[1];

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.userId = data.user.id;
    req.userEmail = data.user.email;

    next();
  } catch (err) {
    console.error('[AUTH ERROR]', err);
    res.status(500).json({ error: 'Internal authentication error' });
  }
};