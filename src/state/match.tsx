'use client';

import { createContext, useContext, useMemo } from 'react';
import { Entity, MatchEvent, MatchIR, TeamInfo } from '@/ir/types';

export interface MatchModel {
  ir: MatchIR;
  /** entities that are players, in stable order */
  players: Entity[];
  ball: Entity;
  teamById: Record<string, TeamInfo>;
  /** events sorted by time, importance-tagged */
  events: MatchEvent[];
  /** notable events for timeline markers (importance >= 0.4) */
  keyEvents: MatchEvent[];
}

const Ctx = createContext<MatchModel | null>(null);

export function buildModel(ir: MatchIR): MatchModel {
  const players = ir.entities.filter((e) => e.role === 'player');
  const ball = ir.entities.find((e) => e.role === 'ball')!;
  const teamById: Record<string, TeamInfo> = {};
  for (const t of ir.meta.teams) teamById[t.id] = t;
  const events = [...ir.events].sort((a, b) => a.t - b.t);
  const keyEvents = events.filter((e) => (e.importance ?? 0) >= 0.4);
  return { ir, players, ball, teamById, events, keyEvents };
}

export function MatchProvider({
  model,
  children,
}: {
  model: MatchModel;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={model}>{children}</Ctx.Provider>;
}

export function useMatch(): MatchModel {
  const m = useContext(Ctx);
  if (!m) throw new Error('useMatch must be used within a MatchProvider');
  return m;
}

/** Convenience hook that memoizes a model from an IR. */
export function useMatchModel(ir: MatchIR): MatchModel {
  return useMemo(() => buildModel(ir), [ir]);
}
