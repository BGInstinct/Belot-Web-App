import { AnimatePresence, motion } from 'framer-motion';
import { cardId, type Seat, type Trick } from '@belot/engine';
import PlayingCard from '@/components/cards/PlayingCard';
import { relPos, type SeatPos } from '../util';
import type { TrickHold } from '../store';

/** unit direction from the table centre towards each seat */
const DIR: Record<SeatPos, [number, number]> = { bottom: [0, 1], top: [0, -1], left: [-1, 0], right: [1, 0] };

/** Cards of the current trick in the centre; they fly in from the player and get swept to the trick winner. */
export default function TrickArea({
  trick,
  hold,
  mySeat,
  scale,
  tight = false,
  spread,
}: {
  trick: Trick | null;
  hold: TrickHold | null;
  mySeat: Seat | null;
  scale: number;
  tight?: boolean;
  /** custom offsets of each seat's card from the centre, in card widths / heights (portrait phone layout) */
  spread?: { x: number; y: number };
}) {
  const showHold = !!hold && (!trick || trick.plays.length === 0 || trickKey(trick) === trickKey(hold.trick));
  const shown = showHold ? hold!.trick : trick;
  const w = 23 * scale;
  const h = 35 * scale;
  const xf = spread?.x ?? (tight ? 0.7 : 0.62);
  const yf = spread?.y ?? (tight ? 0.22 : 0.34);
  // whole pixels keep the sprites crisp
  const slot = spread ? { x: Math.round(w * xf), y: Math.round(h * yf) } : { x: w * xf, y: h * yf };
  const far = { x: w * 5, y: h * 3 };
  const sweepTo = showHold && hold!.sweeping ? DIR[relPos(hold!.winner, mySeat)] : null;
  const key = shown ? trickKey(shown) : 'none';

  return (
    <div className="relative" style={spread ? { width: even(w * (1.3 + 2 * xf)), height: even(h * (1.12 + 2 * yf)) } : { width: Math.round(w * (1.3 + 2 * xf)), height: Math.round(h * (1.12 + 2 * yf)) }}>
      <AnimatePresence>
        {shown?.plays.map((p, i) => {
          const [dx, dy] = DIR[relPos(p.seat, mySeat)];
          return (
            <motion.div
              key={`${key}-${cardId(p.card)}`}
              className="absolute top-1/2 left-1/2"
              style={{ marginLeft: spread ? -Math.floor(w / 2) : -w / 2, marginTop: spread ? -Math.floor(h / 2) : -h / 2, zIndex: i }}
              initial={{ x: dx * far.x, y: dy * far.y, opacity: 0, rotate: spread ? 0 : dx * 25 }}
              animate={
                sweepTo
                  ? { x: sweepTo[0] * far.x, y: sweepTo[1] * far.y, opacity: 0, scale: 0.6, rotate: 0 }
                  : { x: dx * slot.x, y: dy * slot.y, opacity: 1, scale: 1, rotate: spread ? 0 : (i % 2 ? 1 : -1) * (3 + i) }
              }
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ type: 'spring', stiffness: 260, damping: 26 }}
            >
              <PlayingCard card={p.card} scale={scale} highlighted={showHold && hold!.winner === p.seat && !hold!.sweeping} />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** even pixel size, so the 50% centre lands on a whole pixel */
const even = (v: number) => 2 * Math.ceil(v / 2);

function trickKey(t: Trick): string {
  return `${t.leader}-${t.plays[0] ? cardId(t.plays[0].card) : 'x'}`;
}
