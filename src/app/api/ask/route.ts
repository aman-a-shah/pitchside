/**
 * /api/ask — Claude-backed natural-language match navigation.
 *
 * The client's local grammar (lib/ask.ts) handles most queries instantly and
 * offline; this route is the smart fallback for phrasing the grammar can't
 * parse. It receives the query plus a compact context (roster, key events,
 * cameras) and returns a playback plan as strict JSON via structured outputs.
 *
 * Demo-safe: with no ANTHROPIC_API_KEY the route answers 501 and the client
 * permanently falls back to local parsing for the session.
 */

import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'label'],
  properties: {
    ok: {
      type: 'boolean',
      description: 'false when the request cannot be mapped to playback state',
    },
    label: {
      type: 'string',
      description:
        'Short human confirmation of what will happen, e.g. "Goal · Messi · 23\' · slow motion"',
    },
    seekT: { type: 'number', description: 'match-clock seconds to seek to (start of buildup)' },
    follow: { type: 'string', description: 'entity id of a player to follow / view through' },
    camera: { type: 'string', enum: ['broadcast', 'cinematic', 'pov', 'orbit', 'fly', 'player'] },
    speed: { type: 'number', enum: [0.25, 0.5, 1, 2, 4, 8] },
    play: { type: 'boolean' },
  },
} as const;

const SYSTEM = `You control the playback of a 3D football match reconstruction.
Map the user's request to a playback plan. The context lists the real events
of the match (t = match-clock seconds) and the roster (entity ids).

Rules:
- To show a moment, set seekT a few seconds BEFORE the event (6s for goals,
  4s otherwise) and set play=true and speed=1 unless a speed was requested.
- "through X's eyes" / POV → camera="pov" and follow=<that player's id> (the
  actor of the event if no player named).
- "slow motion" → speed=0.25. "director"/"tv production" → camera="cinematic".
- If nothing matches, return ok=false with a label suggesting what to try.
Return only the JSON plan.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, label: 'no key' }, { status: 501 });
  }
  try {
    const { query, context } = (await req.json()) as { query: string; context: unknown };
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2000,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: PLAN_SCHEMA },
      },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Match context:\n${JSON.stringify(context)}\n\nRequest: ${query}`,
        },
      ],
    });
    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') {
      return Response.json({ ok: false, label: 'no plan' }, { status: 502 });
    }
    return Response.json(JSON.parse(text.text));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'ask failed';
    return Response.json({ ok: false, label: msg }, { status: 502 });
  }
}
