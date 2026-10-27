import type { Suit } from '@belot/engine';
import { useTranslation } from 'react-i18next';
import { SUIT_FILE_NAME, useActiveSkin } from '@/skins';

export interface SuitIconProps {
  suit: Suit;
  /** integer scale of the 9x9 pip (default 2) */
  scale?: number;
  /** defaults to the equipped skin; pass 'default' for the classic ♠♥♦♣ pips */
  skinId?: string;
  className?: string;
  title?: string;
}

/** The skin's pixel pip for a suit (coloured as on the cards). */
export function SuitIcon({ suit, scale = 2, skinId, className = '', title }: SuitIconProps) {
  const { t } = useTranslation('common');
  const { skin } = useActiveSkin(skinId);
  const s = Math.max(1, Math.round(scale));
  const path = skin.suitIcons[suit]?.path ?? `/assets/skins/default/suit-icons/${SUIT_FILE_NAME[suit]}.png`;
  const label = title ?? t(`suits.${suit}`);
  return (
    <img
      src={path}
      alt={label}
      title={label}
      draggable={false}
      width={9 * s}
      height={9 * s}
      className={`pixelated inline-block shrink-0 select-none align-middle ${className}`}
      style={{ width: 9 * s, height: 9 * s }}
    />
  );
}

export default SuitIcon;
