import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthedRequest } from '../middleware/auth';
import OpenAI from 'openai';


const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const calculateEloChange = (winnerElo: number, loserElo: number): number => {
  const K = 32;
  const expectedScore = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  return Math.round(K * (1 - expectedScore));
};

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

export const generateVerdict = async (req: AuthedRequest, res: Response) => {
  try {
    const { room_id } = req.params;
    const { transcript, fact_checks } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: 'Transcript is required' });
    }

    const { data: debate, error: debateError } = await supabase
      .from('debates')
      .select('*')
      .eq('room_id', room_id)
      .single();

    if (debateError || !debate) {
      return res.status(404).json({ error: 'Debate not found' });
    }

    if (debate.status !== 'completed') {
      return res.status(400).json({ error: 'Debate is not completed yet' });
    }

    const { data: debaterOne } = await supabase
      .from('users')
      .select('id, username, elo')
      .eq('id', debate.debater_one_id)
      .single();

    const { data: debaterTwo } = await supabase
      .from('users')
      .select('id, username, elo')
      .eq('id', debate.debater_two_id)
      .single();

    if (!debaterOne || !debaterTwo) {
      return res.status(404).json({ error: 'Debaters not found' });
    }

    const scoringPrompt = `
You are an expert debate judge. Analyze this debate transcript and score both debaters.

Topic: "${debate.topic}"
Debater 1 (${debaterOne.username}) argues: ${debate.debater_one_side}
Debater 2 (${debaterTwo.username}) argues: ${debate.debater_two_side}

Transcript:
${transcript}

Score each debater out of 100 across three criteria:
- Logic (0-100): Quality of arguments and reasoning
- Clarity (0-100): How clearly they communicated
- Accuracy (0-100): Factual accuracy of claims

Also provide:
- Overall winner (debater1 or debater2)
- A brief verdict summary (2-3 sentences)
- A full outcome report (5-6 sentences)

Respond ONLY with this JSON format, no extra text:
{
  "debater_one_logic": 0,
  "debater_one_clarity": 0,
  "debater_one_accuracy": 0,
  "debater_one_score": 0,
  "debater_two_logic": 0,
  "debater_two_clarity": 0,
  "debater_two_accuracy": 0,
  "debater_two_score": 0,
  "winner": "debater1",
  "ai_verdict_summary": "",
  "outcome_report": ""
}
    `;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: scoringPrompt }],
      temperature: 0.3,
    });

    const rawResponse = completion.choices[0].message.content || '';
    const cleaned = rawResponse.replace(/```json|```/g, '').trim();
    const scores = JSON.parse(cleaned);

    const winnerId = scores.winner === 'debater1' ? debaterOne.id : debaterTwo.id;
    const loserId = scores.winner === 'debater1' ? debaterTwo.id : debaterOne.id;
    const winnerElo = scores.winner === 'debater1' ? debaterOne.elo : debaterTwo.elo;
    const loserElo = scores.winner === 'debater1' ? debaterTwo.elo : debaterOne.elo;

    const eloChange = calculateEloChange(winnerElo, loserElo);
    const winnerNewElo = winnerElo + eloChange;
    const loserNewElo = Math.max(loserElo - eloChange, 0);

    const debaterOneEloChange = winnerId === debaterOne.id ? eloChange : -eloChange;
    const debaterTwoEloChange = winnerId === debaterTwo.id ? eloChange : -eloChange;

    const { data: verdict, error: verdictError } = await supabase
      .from('verdicts')
      .insert({
        debate_id: debate.id,
        debater_one_score: scores.debater_one_score,
        debater_two_score: scores.debater_two_score,
        debater_one_logic: scores.debater_one_logic,
        debater_one_clarity: scores.debater_one_clarity,
        debater_one_accuracy: scores.debater_one_accuracy,
        debater_two_logic: scores.debater_two_logic,
        debater_two_clarity: scores.debater_two_clarity,
        debater_two_accuracy: scores.debater_two_accuracy,
        debater_one_elo_change: debaterOneEloChange,
        debater_two_elo_change: debaterTwoEloChange,
        fact_check_data: fact_checks || [],
        ai_verdict_summary: scores.ai_verdict_summary,
        outcome_report: scores.outcome_report,
      })
      .select()
      .single();

    if (verdictError) {
      return res.status(500).json({ error: 'Failed to save verdict' });
    }

    await supabase
      .from('debates')
      .update({ winner_id: winnerId })
      .eq('id', debate.id);

    await supabase
      .from('users')
      .update({
        elo: winnerNewElo,
        rank: getRankFromElo(winnerNewElo),
        wins: supabase.rpc('increment_wins', { user_id: winnerId }),
        total_debates: supabase.rpc('increment_total', { user_id: winnerId }),
      })
      .eq('id', winnerId);

    await supabase
      .from('users')
      .update({
        elo: loserNewElo,
        rank: getRankFromElo(loserNewElo),
        losses: supabase.rpc('increment_losses', { user_id: loserId }),
        total_debates: supabase.rpc('increment_total', { user_id: loserId }),
      })
      .eq('id', loserId);

    return res.status(200).json({
      message: 'Verdict generated',
      verdict,
      elo: {
        debater_one: {
          previous: debaterOne.elo,
          change: debaterOneEloChange,
          new: debaterOne.elo + debaterOneEloChange,
        },
        debater_two: {
          previous: debaterTwo.elo,
          change: debaterTwoEloChange,
          new: debaterTwo.elo + debaterTwoEloChange,
        },
      },
    });
  } catch (err) {
    console.error('[GENERATE VERDICT ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getVerdict = async (req: AuthedRequest, res: Response) => {
  try {
    const { debate_id } = req.params;

    const { data, error } = await supabase
      .from('verdicts')
      .select('*')
      .eq('debate_id', debate_id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Verdict not found' });
    }

    return res.status(200).json({ verdict: data });
  } catch (err) {
    console.error('[GET VERDICT ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};