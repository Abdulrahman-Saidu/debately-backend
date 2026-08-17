import { Response } from 'express';
import { supabase } from '../config/supabase';
import { AuthedRequest } from '../middleware/auth';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MAX_TRANSCRIPT_CHARS = 12000;

async function buildTranscriptText(
  debateId: string,
  debaterOne: { id: string; username: string },
  debaterTwo: { id: string; username: string },
): Promise<string> {
  const { data: segments, error } = await supabase
    .from('transcript_segments')
    .select('*')
    .eq('debate_id', debateId)
    .order('turn_number', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  if (!segments || segments.length === 0) return '';

  return segments
    .map((s) => {
      const speaker = s.debater_id === debaterOne.id ? debaterOne.username : debaterTwo.username;
      return `Turn ${s.turn_number} -- ${speaker}: ${s.text}`;
    })
    .join('\n\n');
}

// Shared core -- called both from the HTTP endpoint (manual/debug trigger)
// and automatically from debateController when a debate completes. Safe
// to call more than once for the same debate: it's a no-op if a verdict
// already exists.
export async function generateVerdictForDebate(debateId: string) {
  const { data: existing } = await supabase
    .from('verdicts')
    .select('id')
    .eq('debate_id', debateId)
    .maybeSingle();

  if (existing) return existing;

  const { data: debate, error: debateError } = await supabase
    .from('debates')
    .select('*')
    .eq('id', debateId)
    .single();

  if (debateError || !debate) throw new Error('Debate not found');

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

  if (!debaterOne || !debaterTwo) throw new Error('Debaters not found');

  let transcript = await buildTranscriptText(debateId, debaterOne, debaterTwo);
  let transcriptNote = '';

  if (!transcript) {
    // Happens if speech recognition failed for both sides (e.g. neither
    // was on Chrome, or mic permission issues) -- still produce a verdict
    // rather than leaving the debate stuck with none, but tell the model
    // it has nothing to actually judge so it doesn't hallucinate content.
    transcript = '[No transcript was captured for this debate.]';
    transcriptNote =
      'No transcript is available. Do not invent claims either debater made. Score both debaters at 0 across all criteria, and say in the outcome report that no transcript was captured.';
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

${transcriptNote}

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
      fact_check_data: [],
      ai_verdict_summary: scores.ai_verdict_summary,
      outcome_report: scores.outcome_report,
    })
    .select()
    .single();

  if (verdictError) throw new Error(verdictError.message);

  return verdict;
}

// Manual/debug HTTP trigger -- normally you won't need to call this since
// debateController fires generateVerdictForDebate automatically when a
// debate completes. Useful if generation failed and you want to retry.
export const generateVerdict = async (req: AuthedRequest, res: Response) => {
  try {
    const { room_id } = req.params;

    const { data: debate, error: debateError } = await supabase
      .from('debates')
      .select('id, status')
      .eq('room_id', room_id)
      .single();

    if (debateError || !debate) {
      return res.status(404).json({ error: 'Debate not found' });
    }

    if (debate.status !== 'completed') {
      return res.status(400).json({ error: 'Debate is not completed yet' });
    }

    const verdict = await generateVerdictForDebate(debate.id);

    return res.status(200).json({ message: 'Verdict generated', verdict });
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