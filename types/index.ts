export type DebateStatus = 'open' | 'pending_invite' | 'in_progress' | 'completed' | 'declined';

export interface User {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  bio: string | null;
  rules_accepted: boolean;
  created_at: string;
}

export interface Debate {
  id: string;
  room_id: string;
  topic: string;
  creator_id: string;
  debater_one_id: string;
  debater_two_id: string | null;
  debater_one_side: 'FOR' | 'AGAINST' | null;
  debater_two_side: 'FOR' | 'AGAINST' | null;
  status: DebateStatus;
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
  winner_id: string;
  debater_one_score: number;
  debater_two_score: number;
  debater_one_logic: number;
  debater_one_clarity: number;
  debater_one_accuracy: number;
  debater_two_logic: number;
  debater_two_clarity: number;
  debater_two_accuracy: number;
  fact_check_data: FactCheckItem[];
  ai_verdict_summary: string;
  outcome_report: string;
  created_at: string;
}