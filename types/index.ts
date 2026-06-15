export type DebateStatus = 'waiting' | 'live' | 'completed';

export type Rank = 'Pawn' | 'Knight' | 'Bishop' | 'Rook' | 'Queen' | 'King' | 'Champion' | 'Grandmaster';

export interface User {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  bio: string | null;
  interests: string[];
  rules_accepted: boolean;
  elo: number;
  rank: Rank;
  wins: number;
  losses: number;
  total_debates: number;
  created_at: string;
}

export interface Debate {
  id: string;
  room_id: string;
  topic: string;
  debater_one_id: string;
  debater_two_id: string | null;
  debater_one_side: 'FOR' | 'AGAINST' | null;
  debater_two_side: 'FOR' | 'AGAINST' | null;
  status: DebateStatus;
  winner_id: string | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface FactCheckItem {
  claim: string;
  status: 'verified' | 'debunked' | 'unverifiable';
  explanation: string;
  source?: string;
  speaker_id: string;
}

export interface Verdict {
  id: string;
  debate_id: string;
  debater_one_score: number;
  debater_two_score: number;
  debater_one_logic: number;
  debater_one_clarity: number;
  debater_one_accuracy: number;
  debater_two_logic: number;
  debater_two_clarity: number;
  debater_two_accuracy: number;
  debater_one_elo_change: number;
  debater_two_elo_change: number;
  fact_check_data: FactCheckItem[];
  ai_verdict_summary: string;
  outcome_report: string;
  created_at: string;
}

export interface Comment {
  id: string;
  debate_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface Vote {
  id: string;
  debate_id: string;
  user_id: string;
  voted_for: string;
  created_at: string;
}