'use client';

import { useMatch } from '@/state/match';
import Player from './Player';
import Ball from './Ball';

export default function Entities() {
  const { ir, players, teamById, events } = useMatch();

  return (
    <group>
      {players.map((p) => {
        const team = p.team ? teamById[p.team] : undefined;
        if (!team) return null;
        return (
          <Player
            key={p.id}
            id={p.id}
            track={ir.tracks[p.id]}
            kit={team.kit}
            number={p.number ?? 0}
            isGK={p.position === 'GK'}
            events={events}
          />
        );
      })}
      <Ball track={ir.tracks['ball']} sport={ir.sport} />
    </group>
  );
}
