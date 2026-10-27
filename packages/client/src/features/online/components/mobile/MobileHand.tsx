import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { cardId, sameCard, type Card, type Contract } from '@belot/engine';
import PlayingCard from '@/components/cards/PlayingCard';
import { sortHand } from '../../util';
import { CARD_H, CARD_W, mobileHandLayout } from './handLayout';

/**
 * Own hand for the portrait phone drawer: flat (unrotated, whole-pixel positions) rows of big cards.
 * Same states as the desktop hand: legal cards flare on our turn, illegal ones dim, the selected one lifts;
 * tap selects, tapping the selected card again plays it (handled by `onSelect`).
 */
export default function MobileHand({
  hand,
  contract,
  legalCards,
  canPlay,
  selected,
  onSelect,
  scale,
  width,
}: {
  hand: Card[];
  contract: Contract | null;
  legalCards: Card[];
  canPlay: boolean;
  selected: Card | null;
  onSelect: (c: Card) => void;
  scale: number;
  width: number;
}) {
  const cards = sortHand(hand, contract);
  const n = cards.length;
  const L = mobileHandLayout(n, scale, width);
  const s = L.scale;
  const w = CARD_W * s;
  const h = CARD_H * s;
  let idx = 0;
  const pos = L.rows.flatMap((count, r) => {
    const rowW = count > 0 ? w + L.step * (count - 1) : 0;
    const x0 = Math.floor((L.width - rowW) / 2);
    return Array.from({ length: count }, (_, j) => ({ x: x0 + j * L.step, y: L.head + r * (h + L.rowGap), i: idx++ }));
  });

  return (
    <div className="relative mx-auto shrink-0" style={{ width: L.width, height: L.height }} data-hand-scale={s} data-hand-rows={L.rows.length} data-testid="mobile-hand">
      {cards.map((c, i) => {
        const legal = legalCards.some((l) => sameCard(l, c));
        const isSel = !!selected && sameCard(selected, c);
        const dim = canPlay && !legal;
        const p = pos[i];
        return (
          <motion.div
            key={cardId(c)}
            className="absolute top-0 left-0"
            style={{ zIndex: isSel ? n + 1 : i }}
            initial={{ opacity: 0, x: p.x, y: L.height }}
            animate={{ opacity: 1, x: p.x, y: p.y }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <PlayingCard
              card={c}
              scale={s}
              disabled={dim}
              flare={canPlay && legal && !isSel}
              selected={isSel}
              noHover
              onClick={canPlay && legal ? () => onSelect(c) : undefined}
              style={{ '--sheen-delay': `${(i * 0.09).toFixed(2)}s` } as CSSProperties}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
