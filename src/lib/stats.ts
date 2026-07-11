/**
 * Live match statistics derived from the IR event stream.
 *
 * `buildStatsTable(ir)` is called once per match (memoize it); it pre-sorts
 * per-stat, per-side event times so evaluating the table at any clock time is
 * a handful of binary searches — cheap enough to run at the HUD's ~15Hz uiT.
 *
 * `scoreMoments(ir)` joins scoreboard transitions to their nearest scoring
 * event so the celebration banner and timeline chapter ticks can show the
 * scorer, not just the number flip.
 */

import type { EventType, MatchEvent, MatchIR } from '@/ir/types';

export interface StatRow {
  label: string;
  homeText: string;
  awayText: string;
  /** 0..1 share of the mirrored bar given to home (0.5 when both sides are 0) */
  homeShare: number;
}

export type StatsAt = (t: number) => StatRow[];

/** Count of values <= t in a sorted array (upper bound, binary search). */
function countAt(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function share(home: number, away: number): number {
  const total = home + away;
  return total === 0 ? 0.5 : home / total;
}

/** Sorted event times for one side, filtered by type + team id. */
function sideTimes(events: MatchEvent[], types: EventType[], teamId: string): number[] {
  const set = new Set<EventType>(types);
  const out: number[] = [];
  for (const e of events) {
    if (e.team === teamId && set.has(e.type)) out.push(e.t);
  }
  out.sort((a, b) => a - b);
  return out;
}

/** Latest scoreboard snapshot at or before t (the HUD convention). */
function scoreAt(ir: MatchIR, t: number): { home: number; away: number } {
  const snaps = ir.scoreboard;
  let home = 0;
  let away = 0;
  for (const s of snaps) {
    if (s.t > t) break;
    home = s.home;
    away = s.away;
  }
  return { home, away };
}

export function buildStatsTable(ir: MatchIR): StatsAt {
  const homeId = ir.meta.teams[0]?.id ?? 'H';
  const awayId = ir.meta.teams[1]?.id ?? 'A';
  const ev = ir.events;

  /** simple mirrored count row */
  function countRow(label: string, types: EventType[]): (t: number) => StatRow {
    const h = sideTimes(ev, types, homeId);
    const a = sideTimes(ev, types, awayId);
    return (t) => {
      const hc = countAt(h, t);
      const ac = countAt(a, t);
      return { label, homeText: String(hc), awayText: String(ac), homeShare: share(hc, ac) };
    };
  }

  if (ir.sport === 'soccer') {
    const goals = countRow('Goals', ['goal']);
    const shots = countRow('Shots', ['shot', 'goal']);
    // A save belongs to the keeper's (defending) team — credit the attacker.
    const homeGoals = sideTimes(ev, ['goal'], homeId);
    const awayGoals = sideTimes(ev, ['goal'], awayId);
    const homeSavesFaced = sideTimes(ev, ['save'], awayId); // away keeper saved → home on target
    const awaySavesFaced = sideTimes(ev, ['save'], homeId);
    const tackles = countRow('Tackles', ['tackle']);
    const homePasses = sideTimes(ev, ['pass'], homeId);
    const awayPasses = sideTimes(ev, ['pass'], awayId);

    return (t) => {
      const hOn = countAt(homeGoals, t) + countAt(homeSavesFaced, t);
      const aOn = countAt(awayGoals, t) + countAt(awaySavesFaced, t);
      const hp = countAt(homePasses, t);
      const ap = countAt(awayPasses, t);
      const hPoss = hp + ap === 0 ? 50 : Math.round((hp / (hp + ap)) * 100);
      return [
        {
          label: 'Possession',
          homeText: `${hPoss}%`,
          awayText: `${100 - hPoss}%`,
          homeShare: hPoss / 100,
        },
        shots(t),
        {
          label: 'On target',
          homeText: String(hOn),
          awayText: String(aOn),
          homeShare: share(hOn, aOn),
        },
        goals(t),
        tackles(t),
      ];
    };
  }

  if (ir.sport === 'basketball') {
    const made = { h: sideTimes(ev, ['made_shot'], homeId), a: sideTimes(ev, ['made_shot'], awayId) };
    const missed = {
      h: sideTimes(ev, ['missed_shot'], homeId),
      a: sideTimes(ev, ['missed_shot'], awayId),
    };
    const rebounds = countRow('Rebounds', ['rebound']);
    return (t) => {
      const { home, away } = scoreAt(ir, t);
      const hm = countAt(made.h, t);
      const am = countAt(made.a, t);
      const hAtt = hm + countAt(missed.h, t);
      const aAtt = am + countAt(missed.a, t);
      return [
        {
          label: 'Points',
          homeText: String(home),
          awayText: String(away),
          homeShare: share(home, away),
        },
        {
          label: 'Field goals',
          homeText: `${hm}/${hAtt}`,
          awayText: `${am}/${aAtt}`,
          homeShare: share(hm, am),
        },
        {
          label: 'FG %',
          homeText: hAtt ? `${Math.round((hm / hAtt) * 100)}%` : '—',
          awayText: aAtt ? `${Math.round((am / aAtt) * 100)}%` : '—',
          homeShare: share(hAtt ? hm / hAtt : 0, aAtt ? am / aAtt : 0),
        },
        rebounds(t),
      ];
    };
  }

  // tennis
  const points = countRow('Points won', ['point']);
  const serves = countRow('Serves', ['serve']);
  return (t) => {
    const { home, away } = scoreAt(ir, t);
    return [
      {
        label: 'Games',
        homeText: String(home),
        awayText: String(away),
        homeShare: share(home, away),
      },
      points(t),
      serves(t),
    ];
  };
}

/* ------------------------------------------------------------------ */

export interface ScoreMoment {
  t: number;
  side: 'home' | 'away';
  /** score after this moment */
  home: number;
  away: number;
  /** the scoring event nearest the flip, when one exists within ±3s */
  event?: MatchEvent;
  /** broadcast caption label, per sport */
  label: string;
}

const SCORING_TYPES: Record<string, EventType[]> = {
  soccer: ['goal'],
  basketball: ['made_shot', 'dunk'],
  tennis: ['point'],
};

function momentLabel(ir: MatchIR, delta: number): string {
  if (ir.sport === 'soccer') return 'Goal';
  if (ir.sport === 'basketball') return delta >= 3 ? 'Three' : 'Basket';
  return 'Game';
}

export function scoreMoments(ir: MatchIR): ScoreMoment[] {
  const homeId = ir.meta.teams[0]?.id ?? 'H';
  const scoring = new Set<EventType>(SCORING_TYPES[ir.sport] ?? []);
  const scoringEvents = ir.events.filter((e) => scoring.has(e.type));

  const out: ScoreMoment[] = [];
  let prevH = 0;
  let prevA = 0;
  for (const snap of ir.scoreboard) {
    if (snap.home === prevH && snap.away === prevA) continue;
    const side: 'home' | 'away' = snap.home !== prevH ? 'home' : 'away';
    const delta = side === 'home' ? snap.home - prevH : snap.away - prevA;
    const sideId = side === 'home' ? homeId : (ir.meta.teams[1]?.id ?? 'A');

    let best: MatchEvent | undefined;
    let bestDist = 3;
    for (const e of scoringEvents) {
      const d = Math.abs(e.t - snap.t);
      if (d <= bestDist && (!e.team || e.team === sideId)) {
        best = e;
        bestDist = d;
      }
    }

    out.push({
      t: snap.t,
      side,
      home: snap.home,
      away: snap.away,
      event: best,
      label: momentLabel(ir, delta),
    });
    prevH = snap.home;
    prevA = snap.away;
  }
  return out;
}
