import { motion } from 'framer-motion';
import PlayingCard from '@/components/cards/PlayingCard';

/**
 * Overlapping face-down cards (other players' hands).
 * - horizontal (top partner): upright backs in a row.
 * - vertical (left/right players): backs turned 90° (long edge horizontal, like a hand held by
 *   someone seated at the side) stacked downwards with overlap. `side` picks the rotation so the
 *   backs face the table centre.
 */
export default function CardBacks({
  count,
  scale,
  maxWidth,
  backId,
  vertical = false,
  side = 'left',
}: {
  count: number;
  scale: number;
  /** max length of the stack along its main axis (px) */
  maxWidth: number;
  backId?: string;
  vertical?: boolean;
  side?: 'left' | 'right';
}) {
  const s = scale;
  const w = 23 * s;
  const h = 35 * s;
  // footprint of one card along / across the stack
  // upright row: card width; sideways column: the rotated card's height, which is also w
  const along = w;
  const across = h;
  const step = count > 1 ? Math.max(2 * s, Math.min(Math.round(along * (vertical ? 0.36 : 0.42)), Math.floor((maxWidth - along) / (count - 1)))) : 0;
  const total = count > 0 ? along + step * (count - 1) : 0;
  // centre a w×h card inside an h×w box before rotating it 90° (integer offsets keep pixels crisp)
  const shift = (h - w) / 2;
  const box = vertical ? { width: across, height: Math.max(total, along) } : { width: Math.max(total, along), height: across };

  return (
    <div
      className="relative shrink-0"
      style={{ ...box, filter: `drop-shadow(0 ${s}px 0 rgb(21 29 40 / 0.55))` }}
      aria-label={`${count}`}
      data-backs={vertical ? 'side' : 'row'}
    >
      {Array.from({ length: count }, (_, i) => (
        <motion.div
          key={i}
          className="absolute top-0 left-0"
          style={vertical ? { width: h, height: w } : undefined}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1, x: vertical ? 0 : i * step, y: vertical ? i * step : 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, delay: i * 0.03 }}
        >
          <div style={vertical ? { position: 'absolute', left: shift, top: -shift, transform: `rotate(${side === 'left' ? 90 : -90}deg)` } : undefined}>
            <PlayingCard faceDown scale={s} backId={backId} noHover style={{ filter: 'none' }} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
