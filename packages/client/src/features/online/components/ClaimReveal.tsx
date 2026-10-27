/** Claim All (Прибиране) reveal: the claimer's remaining hand face-up in the table centre + success / penalty banner. */
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { cardId, type ClaimInfo, type Contract, type RoomView, type Seat } from '@belot/engine';
import PlayingCard from '@/components/cards/PlayingCard';
import { seatName, sortHand, teamOf } from '../util';

export function useClaimerName(room: RoomView, mySeat: Seat | null) {
  const { t } = useTranslation('game');
  return (seat: Seat) => (seat === mySeat ? t('you') : seatName(room, seat, t('bot'), '?'));
}

export default function ClaimReveal({
  claim,
  room,
  mySeat,
  contract,
  scale,
  compact,
}: {
  claim: ClaimInfo;
  room: RoomView;
  mySeat: Seat | null;
  contract: Contract | null;
  scale: number;
  compact: boolean;
}) {
  const { t } = useTranslation('game');
  const name = useClaimerName(room, mySeat)(claim.seat);
  const cards = sortHand(claim.revealed, contract);
  const mine = mySeat !== null && teamOf(mySeat) === teamOf(claim.seat);
  const tone = claim.success ? 'bg-emerald-700' : 'bg-red-700';

  return (
    <motion.div
      data-testid="claim-reveal"
      data-success={claim.success}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className="z-20 flex max-w-[min(560px,92vw)] flex-col items-center gap-2 border-4 border-black bg-slate-950/90 p-2 shadow-[4px_4px_0_#000] sm:p-3"
    >
      <div className={`flex items-center gap-1.5 border-2 border-black px-2 py-1 text-center text-[9px] text-white sm:text-[10px] ${tone}`}>
        {claim.success ? <Check size={14} className="shrink-0" /> : <X size={14} className="shrink-0" />}
        <span className="min-w-0 text-balance wrap-anywhere">
          {t(mySeat === claim.seat ? 'claim.bannerYou' : 'claim.banner', { name })} — {claim.success ? t('claim.success') : t('claim.failed')}
        </span>
      </div>
      <div className="flex flex-wrap justify-center gap-1">
        {cards.map((c, i) => (
          <motion.div key={cardId(c)} initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 * i }}>
            <PlayingCard card={c} scale={compact ? Math.max(1, scale - 1) : scale} noHover />
          </motion.div>
        ))}
      </div>
      <p className={`text-center text-[8px] leading-relaxed text-balance sm:text-[9px] ${claim.success ? 'text-emerald-200' : 'text-red-200'}`}>
        {claim.success
          ? t('claim.successDetail', { count: claim.tricksClaimed })
          : t(mySeat === null ? 'claim.penalty' : mine ? 'claim.penaltyUs' : 'claim.penaltyThem', { count: claim.tricksClaimed })}
      </p>
    </motion.div>
  );
}
