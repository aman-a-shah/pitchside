/**
 * Ask the match — natural language → playback state.
 *
 * Turns a typed request ("show me Maradona's second goal in slow motion,
 * through his eyes") into a concrete playback plan: a seek, a camera mode, a
 * followed player, a speed. Runs entirely client-side over the match's real
 * event stream, so it works offline and answers in microseconds; an optional
 * Claude-backed route (/api/ask) can layer richer language on top, with this
 * parser as the always-works fallback.
 *
 * The grammar is small but composes: [event | minute | player] × [ordinal] ×
 * [camera] × [speed]. Famous moments get per-match aliases ("the hand of
 * god") that rewrite into the grammar before parsing.
 */

import type { CameraMode } from '@/state/clock';
import type { MatchModel } from '@/state/match';
import type { Entity, MatchEvent, MatchIR, TeamInfo } from '@/ir/types';
import { broadcastClock } from '@/lib/format';

/**
 * 'pov' survives here as a plan-level alias (the LLM route and the local
 * grammar both speak it); the executor maps it to the player cam in first
 * person. 'player' means the player cam in third person.
 */
export type AskCamera = CameraMode | 'pov';

export interface AskPlan {
  ok: boolean;
  /** human-readable interpretation shown before/after executing */
  label: string;
  seekT?: number;
  follow?: string;
  camera?: AskCamera;
  speed?: number;
  play?: boolean;
}

// ------------------------------ text utils -----------------------------------

/** lowercase + strip diacritics, so "Mbappé" matches "mbappe" */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const ORDINAL_WORDS: Record<string, number> = {
  first: 0,
  opening: 0,
  second: 1,
  third: 2,
  fourth: 3,
  fifth: 4,
  sixth: 5,
};

// ---------------------------- famous-moment aliases ---------------------------
// Phrase → a rewritten query the grammar below understands. Keyed by match id.

const ALIASES: Record<string, [string, string][]> = {
  // Argentina v England, 1986 quarter-final
  'sb-3750191': [
    ['hand of god', "argentina's first goal in slow motion"],
    ['goal of the century', "maradona's second goal through his eyes"],
  ],
  // Argentina v France, 2022 final
  'sb-3869685': [
    ['hat-trick', "mbappe's third goal in slow motion"],
    ['hat trick', "mbappe's third goal in slow motion"],
  ],
  // Brazil v Italy, 1970 final
  'sb-3888702': [['greatest team goal', "brazil's fourth goal in slow motion"]],
  // Brazil v Sweden, 1958 final
  'sb-3888705': [['pele', "pele's first goal"]],
};

function applyAliases(matchId: string, q: string): string {
  for (const [phrase, rewrite] of ALIASES[matchId] ?? []) {
    if (q.includes(phrase)) return rewrite;
  }
  return q;
}

// ------------------------------ sub-parsers -----------------------------------

function parseCamera(q: string): AskCamera | undefined {
  if (/\bpov\b|first.person|through .{0,24}eyes|\bhis eyes\b|\bher eyes\b/.test(q)) return 'pov';
  if (/\bdirector\b|\bcinematic\b|auto.?cam|\btv mode\b/.test(q)) return 'cinematic';
  if (/\bbroadcast\b|\btv\b/.test(q)) return 'broadcast';
  if (/\borbit\b/.test(q)) return 'orbit';
  if (/\bfly\b|free.?cam/.test(q)) return 'fly';
  if (/behind the goal|net.?cam/.test(q)) return 'cinematic'; // director owns the net-cam
  return undefined;
}

function parseSpeed(q: string): number | undefined {
  if (/slow.?mo|slow motion|in slow|slowly/.test(q)) return 0.25;
  if (/half speed/.test(q)) return 0.5;
  if (/normal speed|real.?time|1x/.test(q)) return 1;
  const m = q.match(/\b([248])\s*(?:x|times)\b/);
  if (m) return parseInt(m[1], 10);
  return undefined;
}

function parseOrdinal(q: string): number | null | 'last' {
  if (/\blast\b|\bfinal\b(?! third)|\bwinning\b|\bwinner\b/.test(q)) return 'last';
  const d = q.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/);
  if (d) return parseInt(d[1], 10) - 1;
  for (const [w, i] of Object.entries(ORDINAL_WORDS)) {
    if (new RegExp(`\\b${w}\\b`).test(q)) return i;
  }
  return null;
}

function parseMinute(q: string): number | null {
  const m =
    q.match(/\bminute\s+(\d{1,3})\b/) ??
    q.match(/\b(\d{1,3})\s*(?:st|nd|rd|th)?\s*minute\b/) ??
    q.match(/\b(\d{1,3})'/);
  return m ? parseInt(m[1], 10) : null;
}

/** broadcast minute → match-clock seconds (inverse of lib/format broadcastClock) */
function minuteToT(ir: MatchIR, minute: number): number {
  const ps = ir.periods;
  if (!ps?.length) return minute * 60;
  let cur = ps[0];
  for (const p of ps) {
    if (p.label !== 'Penalties' && minute > p.startMinute) cur = p;
  }
  return cur.t0 + Math.max(0, minute - 1 - cur.startMinute) * 60;
}

function findPlayer(q: string, players: Entity[]): Entity | undefined {
  let best: Entity | undefined;
  let bestLen = 0;
  for (const p of players) {
    if (!p.name) continue;
    const n = fold(p.name);
    if (n.length > bestLen && n.length >= 3 && q.includes(n)) {
      best = p;
      bestLen = n.length;
    }
  }
  return best;
}

function findTeam(q: string, teams: TeamInfo[]): TeamInfo | undefined {
  let best: TeamInfo | undefined;
  let bestLen = 0;
  for (const t of teams) {
    const n = fold(t.name);
    if (n.length > bestLen && q.includes(n)) {
      best = t;
      bestLen = n.length;
    }
  }
  return best;
}

interface EventQuery {
  /** filter over the event stream */
  match: (e: MatchEvent) => boolean;
  /** how the label names it */
  noun: string;
  /** seconds of buildup shown before the moment */
  lead: number;
}

function parseEventQuery(q: string): EventQuery | null {
  if (/own goal/.test(q))
    return { match: (e) => e.type === 'goal' && !!e.text?.includes('own goal'), noun: 'Own goal', lead: 6 };
  if (/\bgoals?\b|\bscore[sd]?\b|equali[sz]er|\bopener\b|\bwinner\b|\bheader\b/.test(q))
    return { match: (e) => e.type === 'goal', noun: 'Goal', lead: 6 };
  if (/red card|sent off|sending.off/.test(q))
    return { match: (e) => e.type === 'card' && !!e.text?.startsWith('RED'), noun: 'Red card', lead: 4 };
  if (/yellow card|\bbooking\b|\bbooked\b/.test(q))
    return { match: (e) => e.type === 'card' && !e.text?.startsWith('RED'), noun: 'Yellow card', lead: 4 };
  if (/\bsaves?\b|\bdenied\b|\bstop\b/.test(q))
    return { match: (e) => e.type === 'save', noun: 'Save', lead: 4 };
  if (/shoot.?out|\bpenalties\b|\bpens\b/.test(q))
    return { match: (e) => e.type === 'restart' && !!e.text?.includes('Penalty shoot-out'), noun: 'Penalty shoot-out', lead: 1 };
  if (/\bpenalty\b|\bspot.?kick\b/.test(q))
    return { match: (e) => e.type === 'goal' && !!e.text?.includes('(pen)'), noun: 'Penalty goal', lead: 5 };
  if (/woodwork|\bpost\b|crossbar/.test(q))
    return { match: (e) => e.type === 'shot' && !!e.text?.includes('woodwork'), noun: 'Off the woodwork', lead: 4 };
  if (/\bshots?\b|\bchances?\b|\beffort\b/.test(q))
    return { match: (e) => e.type === 'shot' && (e.importance ?? 0) >= 0.6, noun: 'Big chance', lead: 4 };
  if (/kick.?off|\bstart\b|beginning/.test(q))
    return { match: (e) => e.type === 'kickoff', noun: 'Kick-off', lead: 0 };
  if (/second half|half.?time/.test(q))
    return { match: (e) => e.type === 'restart' && !!e.text?.includes('Second half'), noun: 'Second half', lead: 0 };
  if (/extra time/.test(q))
    return { match: (e) => e.type === 'restart' && !!e.text?.includes('Extra time'), noun: 'Extra time', lead: 0 };
  if (/\bsub\b|substitution/.test(q))
    return { match: (e) => e.type === 'sub', noun: 'Substitution', lead: 2 };
  return null;
}

// ------------------------------ the main parse --------------------------------

export function askLocal(rawQuery: string, model: MatchModel, currentT: number): AskPlan {
  const { ir, players, events, teamById } = model;
  const q = applyAliases(ir.id, fold(rawQuery).trim());
  if (!q) return { ok: false, label: '' };

  const camera = parseCamera(q);
  const speed = parseSpeed(q);
  const player = findPlayer(q, players);
  const team = findTeam(q, ir.meta.teams);
  const ordinal = parseOrdinal(q);
  const minute = parseMinute(q);
  const evQuery = parseEventQuery(q);

  const plan: AskPlan = { ok: false, label: '' };
  const parts: string[] = [];

  // ---- resolve a moment ----
  let target: MatchEvent | undefined;
  if (evQuery) {
    let cands = events.filter(evQuery.match);
    if (player) {
      const byActor = cands.filter((e) => e.actor === player.id);
      // goals credited to a player may be tagged by actor; fall back to text
      cands = byActor.length ? byActor : cands.filter((e) => e.text && fold(e.text).includes(fold(player.name!)));
    } else if (team) {
      cands = cands.filter((e) => e.team === team.id);
    }
    if (cands.length) {
      if (ordinal === 'last') target = cands[cands.length - 1];
      else if (typeof ordinal === 'number') target = cands[Math.min(ordinal, cands.length - 1)];
      else if (/\bnext\b/.test(q)) target = cands.find((e) => e.t > currentT + 1) ?? cands[0];
      else target = cands.find((e) => e.t > currentT + 1) ?? cands[0];
    }
    if (target) {
      plan.seekT = Math.max(0, target.t - evQuery.lead);
      plan.play = true;
      const who = target.actor ? players.find((p) => p.id === target!.actor)?.name : undefined;
      const side = target.team ? teamById[target.team]?.short : undefined;
      parts.push(`${evQuery.noun}${who ? ` · ${who}` : side ? ` · ${side}` : ''} · ${broadcastClock(ir, target.t)}`);
    } else {
      return { ok: false, label: `No ${evQuery.noun.toLowerCase()} found${player ? ` for ${player.name}` : ''}.` };
    }
  } else if (minute !== null) {
    plan.seekT = Math.max(0, Math.min(ir.duration - 1, minuteToT(ir, minute)));
    plan.play = true;
    parts.push(`Jump to ${minute}'`);
  }

  // ---- follow / POV ----
  const followable = player ?? (target?.actor ? players.find((p) => p.id === target!.actor) : undefined);
  if (camera === 'pov') {
    plan.camera = 'pov';
    if (followable) plan.follow = followable.id;
    parts.push(`POV${followable ? `: ${followable.name}` : ''}`);
  } else if (camera) {
    plan.camera = camera;
    parts.push(camera === 'cinematic' ? 'Director cam' : `${camera[0].toUpperCase()}${camera.slice(1)} cam`);
  } else if (player && !evQuery && minute === null) {
    // "follow messi" — no moment, just track the player
    plan.follow = player.id;
    plan.camera = 'player';
    parts.push(`Follow ${player.name}`);
  }

  // ---- speed ----
  if (speed !== undefined) {
    plan.speed = speed;
    parts.push(speed === 0.25 ? 'slow motion' : speed === 1 ? 'normal speed' : `${speed}×`);
  } else if (plan.seekT !== undefined) {
    plan.speed = 1; // a requested moment should be watchable, not at 8×
  }

  plan.ok = parts.length > 0;
  plan.label = parts.join(' · ');
  if (!plan.ok) plan.label = 'Try “Messi’s second goal”, “minute 80”, or “follow the keeper in POV”.';
  return plan;
}

// ------------------------------ suggestions -----------------------------------

/** Curated + derived example queries for this match (shown as chips). */
export function askSuggestions(model: MatchModel): string[] {
  const { ir, events, players } = model;
  const out: string[] = [];

  // famous aliases first — these are the demo moments
  for (const [phrase] of ALIASES[ir.id] ?? []) {
    if (!out.some((s) => s.includes(phrase))) out.push(`the ${phrase}`);
  }

  const goals = events.filter((e) => e.type === 'goal' && e.actor);
  const byScorer = new Map<string, number>();
  for (const g of goals) byScorer.set(g.actor!, (byScorer.get(g.actor!) ?? 0) + 1);
  const top = [...byScorer.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top) {
    const scorer = players.find((p) => p.id === top[0]);
    if (scorer?.name) {
      out.push(
        top[1] > 1
          ? `${scorer.name}'s second goal in slow motion`
          : `${scorer.name}'s goal, through his eyes`
      );
    }
  }
  if (events.some((e) => e.type === 'card' && e.text?.startsWith('RED'))) out.push('the red card');
  if (events.some((e) => e.type === 'restart' && e.text?.includes('shoot-out'))) out.push('the penalty shoot-out');
  if (events.some((e) => e.type === 'save')) out.push('the best save');
  out.push('second half in director cam');
  return out.slice(0, 4);
}
