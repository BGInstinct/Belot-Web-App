/** OWNED BY client-foundation agent. Renders a card from the active (or given) skin. */
import type { CSSProperties, KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import type { Card } from '@belot/engine';
import { CARD_HEIGHT, CARD_WIDTH, SUIT_SYMBOL, cardImagePath, useActiveSkin } from '@/skins';

export interface PlayingCardProps {
  card?: Card;
  faceDown?: boolean;
  /** defaults to the user's equipped skin (see src/skins) */
  skinId?: string;
  /** 'default' = skin's default back; otherwise a back id like 'fire/split-flame' */
  backId?: string;
  /** integer pixel scale of the 23x35 sprite (default 3) */
  scale?: number;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** gold pixel outline + slight lift (e.g. playable / winning card) */
  highlighted?: boolean;
  /** lifted state (e.g. card picked in hand) */
  selected?: boolean;
  /** animated "playable" flare: stepped pulsing gold rim + pixel sheen sweep (legal cards on your turn) */
  flare?: boolean;
  /** disable the hover lift even when clickable */
  noHover?: boolean;
  /** framer-motion layoutId for shared-element animations (hand -> table) */
  layoutId?: string;
  style?: CSSProperties;
  title?: string;
}

/** Card sprite at an integer scale with hover-lift / highlight / disabled states. */
export default function PlayingCard({
  card,
  faceDown,
  skinId,
  backId,
  scale = 3,
  className = '',
  onClick,
  disabled,
  highlighted,
  selected,
  flare,
  noHover,
  layoutId,
  style,
  title,
}: PlayingCardProps) {
  const s = Math.max(1, Math.round(scale));
  const { skin, backPath } = useActiveSkin(skinId, backId);
  const showBack = faceDown || !card;
  const src = showBack ? backPath : cardImagePath(card, skin);
  const label = showBack ? 'card back' : `${card.rank}${SUIT_SYMBOL[card.suit]}`;
  const interactive = !!onClick && !disabled;
  const lift = selected ? -6 * s : highlighted || flare ? -2 * s : 0;

  // Pixel outline / glow following the card silhouette is drawn by CSS (0-blur drop shadows, see
  // `.card-fx` in index.css); we only expose the art-pixel size and pick a state.
  const o = Math.max(1, Math.floor(s / 1.5));
  const fx = disabled ? 'disabled' : selected ? 'selected' : flare ? 'playable' : highlighted ? 'hl' : undefined;
  const sheen = !showBack && (fx === 'selected' || fx === 'playable');
  const vars = { '--o': `${o}px`, '--s': `${s}px` } as CSSProperties;

  const onKeyDown = (e: KeyboardEvent) => {
    if (interactive && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <motion.div
      layoutId={layoutId}
      role={onClick ? 'button' : 'img'}
      aria-label={label}
      aria-disabled={onClick ? !!disabled : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={title}
      onClick={interactive ? onClick : undefined}
      onKeyDown={onKeyDown}
      data-fx={fx}
      className={`pixel-game card-fx relative inline-block shrink-0 select-none outline-none focus-visible:outline-none ${
        interactive ? 'cursor-pointer' : disabled ? 'cursor-not-allowed' : ''
      } ${className}`}
      style={{ width: CARD_WIDTH * s, height: CARD_HEIGHT * s, ...vars, ...style }}
      initial={false}
      animate={{ y: lift }}
      whileHover={interactive && !noHover ? { y: lift - 3 * s } : undefined}
      whileFocus={interactive && !noHover ? { y: lift - 3 * s } : undefined}
      whileTap={interactive ? { y: lift - s } : undefined}
      transition={{ type: 'tween', duration: 0.09, ease: 'linear' }}
    >
      <img
        src={src}
        alt={label}
        draggable={false}
        width={CARD_WIDTH * s}
        height={CARD_HEIGHT * s}
        className="pixelated pointer-events-none block h-full w-full"
      />
      {sheen && <span aria-hidden className="card-sheen" style={{ maskImage: `url(${src})`, WebkitMaskImage: `url(${src})` }} />}
    </motion.div>
  );
}

export { PlayingCard };
