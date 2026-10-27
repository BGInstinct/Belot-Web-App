/** Thin adapters over the foundation skin registry (@/skins) for suit icons and the desk background. */
import type { Suit } from '@belot/engine';
import { useActiveBackground, useActiveSkin } from '@/skins';

export const DEFAULT_DESK = '/assets/backgrounds/default-desk.png';

/** suit -> pixel icon path of the equipped skin (undefined → classic glyph). */
export function useSuitIconSrc(): (suit: Suit) => string | undefined {
  const { skin } = useActiveSkin();
  return (suit) => skin.suitIcons?.[suit]?.path || undefined;
}

/** Desk background (equipped background → default desk) + its native tile size. */
export function useDeskBackground(): { path: string; width: number; height: number } {
  const bg = useActiveBackground();
  return { path: bg?.path || DEFAULT_DESK, width: bg?.width || 38, height: bg?.height || 38 };
}
