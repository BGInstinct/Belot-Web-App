import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { cardId, sameCard, type Card, type Contract } from '@belot/engine';
import PlayingCard from '@/components/cards/PlayingCard';
import { sortHand } from '../util';

/**
 * Own hand in a tight arc. Legal cards get the pulsing "playable" flare and a small lift,
 * illegal ones are dimmed while it's our turn; the selected card floats highest.
 *
 * The container reserves room for every lift (selected + hover) on top and for the arc / rotated
 * corners at the bottom, so nothing gets clipped by the viewport or pokes into the action bar.
 */
export default function MyHand({
  hand,
  contract,
  legalCards,
  canPlay,
  selected,
  onSelect,
  scale,
  maxWidth,
}: {
  hand: Card[];
  contract: Contract | null;
  legalCards: Card[];
  canPlay: boolean;
  selected: Card | null;
  onSelect: (c: Card) => void;
  scale: number;
  maxWidth: number;
}) {
  const cards = sortHand(hand, contract);
  const n = cards.length;
  const s = scale;
  const w = 23 * s;
  const h = 35 * s;
  // ~60% of each card stays visible: the sprites only carry the rank in the corner, so the
  // centre pip must show. Shrinks further only if the row would not fit.
  const step = n > 1 ? Math.max(6 * s, Math.min(Math.round(w * 0.6), Math.floor((maxWidth - w) / (n - 1)))) : 0;
  const total = n > 0 ? w + step * (n - 1) : 0;
  // arc consistent with the per-card rotation: drop ≈ x² / 2R with R = step / θ
  const deg = n > 6 ? 2.5 : 3;
  const rad = (deg * Math.PI) / 180;
  const maxOff = Math.max(0, (n - 1) / 2);
  const drop = (off: number) => Math.round(((off * step) ** 2 * rad) / (2 * step || 1));
  // headroom for the biggest lift: selected (6 art px) + hover (3 art px)
  const head = 9 * s;
  // rotated corners of the outermost cards dip by ~ w/2·sinθ
  const rotPad = Math.ceil((w / 2) * Math.sin(rad * maxOff)) + s;
  const height = head + h + drop(maxOff) + rotPad;

  return (
    <div className="relative mx-auto shrink-0" style={{ width: total, height }} data-hand-scale={s}>
      {cards.map((c, i) => {
        const legal = legalCards.some((l) => sameCard(l, c));
        const isSel = !!selected && sameCard(selected, c);
        const off = i - (n - 1) / 2;
        const dim = canPlay && !legal;
        return (
          <motion.div
            key={cardId(c)}
            className="absolute top-0 left-0"
            style={{ zIndex: isSel ? n + 1 : i }}
            initial={{ opacity: 0, y: head + h, x: total / 2 - w / 2, rotate: 0 }}
            animate={{ opacity: 1, x: i * step, y: head + drop(Math.abs(off)), rotate: off * deg }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <PlayingCard
              card={c}
              scale={s}
              disabled={dim}
              flare={canPlay && legal && !isSel}
              selected={isSel}
              onClick={canPlay && legal ? () => onSelect(c) : undefined}
              style={{ '--sheen-delay': `${(i * 0.09).toFixed(2)}s` } as CSSProperties}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
