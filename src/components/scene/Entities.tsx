'use client';

import { Suspense } from 'react';
import { useMatch } from '@/state/match';
import Player from './Player';
import Athlete from './Athlete';
import Ball from './Ball';

export default function Entities() {
  const { ir, players, teamById, events } = useMatch();

  return (
    <group>
      {players.map((p) => {
        const team = p.team ? teamById[p.team] : undefined;
        if (!team) return null;
        return (
          <Suspense
            key={p.id}
            fallback={
              /* procedural rig shows until the athlete GLB is ready */
              <Player
                id={p.id}
                track={ir.tracks[p.id]}
                kit={team.kit}
                number={p.number ?? 0}
                isGK={p.position === 'GK'}
                events={events}
              />
            }
          >
            <Athlete
              id={p.id}
              track={ir.tracks[p.id]}
              kit={team.kit}
              number={p.number ?? 0}
              isGK={p.position === 'GK'}
              events={events}
              sport={ir.sport}
            />
          </Suspense>
        );
      })}
      <Ball track={ir.tracks['ball']} sport={ir.sport} />
    </group>
  );
}
