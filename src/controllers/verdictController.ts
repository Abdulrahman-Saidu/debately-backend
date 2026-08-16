import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthedRequest } from '../middleware/auth';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Safety net on input cost: caps how much transcript text gets sent to
// GPT regardless of how long the actual debate recording turns out to be.
// ~12k chars is roughly 3k tokens -- comfortably covers a full 20-min
// debate transcript without needing this in normal operation.
const MAX_TRANSCRIPT_CHARS = 12000;

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

    // Doc scope: no elo on users, so this is identity only.
    const { data: debaterOne } = await supabase
      .from('users')
      .select('id, username')
      .eq('id', debate.debater_one_id)
      .single();

    const { data: debaterTwo } = await supabase
      .from('users')
      .select('id, username')
      .eq('id', debate.debater_two_id)
      .single();

    if (!debaterOne || !debaterTwo) {
      return res.status(404).json({ error: 'Debaters not found' });
    }

    const trimmedTranscript =
      transcript.length > MAX_TRANSCRIPT_CHARS
        ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) + '\n[...transcript truncated for length]'
        : transcript;

    const scoringPrompt = `
You are an expert debate judge. Analyze this debate transcript and score both debaters.

Topic: "${debate.topic}"
Debater 1 (${debaterOne.username}) argues: ${debate.debater_one_side}
Debater 2 (${debaterTwo.username}) argues: ${debate.debater_two_side}

Transcript:
${trimmedTranscript}

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

    // gpt-4o-mini stays the model of choice -- cheapest tier with reliable
    // reasoning quality for scoring; max_tokens + json_object mode below
    // are what actually bound the cost, not a model swap.
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: scoringPrompt }],
      temperature: 0.3,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    });

    const rawResponse = completion.choices[0].message.content || '';
    const scores = JSON.parse(rawResponse);

    const winnerId = scores.winner === 'debater1' ? debaterOne.id : debaterTwo.id;

    // TODO(real fact-checking): fact_checks is still accepted raw from the
    // client and stored as-is -- not AI-generated/verified yet.
    const { data: verdict, error: verdictError } = await supabase
      .from('verdicts')
      .insert({
        debate_id: debate.id,
        winner_id: winnerId,
        debater_one_score: scores.debater_one_score,
        debater_two_score: scores.debater_two_score,
        debater_one_logic: scores.debater_one_logic,
        debater_one_clarity: scores.debater_one_clarity,
        debater_one_accuracy: scores.debater_one_accuracy,
        debater_two_logic: scores.debater_two_logic,
        debater_two_clarity: scores.debater_two_clarity,
        debater_two_accuracy: scores.debater_two_accuracy,
        fact_check_data: fact_checks || [],
        ai_verdict_summary: scores.ai_verdict_summary,
        outcome_report: scores.outcome_report,
      })
      .select()
      .single();

    if (verdictError) {
      console.error('[GENERATE VERDICT ERROR]', verdictError);
      return res.status(500).json({ error: verdictError.message });
    }

    return res.status(200).json({
      message: 'Verdict generated',
      verdict,
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