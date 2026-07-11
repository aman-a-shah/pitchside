'use client';

import { useMatch } from '@/state/match';
import { SceneTheme } from './theme';
import SoccerPitch from './field/SoccerPitch';
import BasketballCourt from './field/BasketballCourt';
import TennisCourt from './field/TennisCourt';

export default function Field({ theme }: { theme: SceneTheme }) {
  const { ir } = useMatch();
  switch (ir.sport) {
    case 'soccer':
      return <SoccerPitch field={ir.fieldSpec} theme={theme} />;
    case 'basketball':
      return <BasketballCourt field={ir.fieldSpec} />;
    case 'tennis':
      return <TennisCourt field={ir.fieldSpec} />;
    default:
      return null;
  }
}
