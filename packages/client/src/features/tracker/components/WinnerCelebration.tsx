import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { PixelButton, PixelModal } from '@/components/ui';

const CONFETTI_COLORS = ['#facc15', '#ef4444', '#22c55e', '#3b82f6', '#f97316', '#ffffff'];

function PixelConfetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 6 + Math.floor(Math.random() * 3) * 4,
        delay: Math.random() * 1.2,
        duration: 2.2 + Math.random() * 1.8,
        drift: (Math.random() - 0.5) * 120,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          className="absolute top-0"
          style={{ left: `${p.left}%`, width: p.size, height: p.size, background: p.color, boxShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}
          initial={{ y: -40, x: 0, rotate: 0 }}
          animate={{ y: '110vh', x: p.drift, rotate: 360 }}
          transition={{ delay: p.delay, duration: p.duration, ease: 'linear', repeat: Infinity, repeatDelay: 0.3 }}
        />
      ))}
    </div>
  );
}

export function WinnerCelebration({
  open,
  winnerName,
  totals,
  onClose,
  onNewMatch,
}: {
  open: boolean;
  winnerName: string;
  totals: [number, number];
  onClose: () => void;
  onNewMatch: () => void;
}) {
  const { t } = useTranslation('tracker');
  return (
    <>
      {open && <PixelConfetti />}
      <PixelModal open={open} onClose={onClose} title={t('winner.title')}>
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: [0, 1.3, 1], rotate: [-20, 10, 0], y: [0, -8, 0] }}
            transition={{ duration: 0.9, y: { repeat: Infinity, duration: 1.2, delay: 0.9 } }}
          >
            <Trophy size={72} className="text-amber-400 drop-shadow-[4px_4px_0_rgba(0,0,0,0.6)]" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-xl leading-relaxed text-amber-300"
          >
            {t('winner.wins', { team: winnerName })}
          </motion.div>
          <div className="text-3xl tabular-nums">{t('winner.score', { a: totals[0], b: totals[1] })}</div>
          <div className="grid w-full grid-cols-2 gap-2">
            <PixelButton type="button" variant="dark" className="min-h-12" onClick={onClose}>
              {t('winner.close')}
            </PixelButton>
            <PixelButton type="button" variant="green" className="min-h-12" onClick={onNewMatch}>
              {t('winner.newMatch')}
            </PixelButton>
          </div>
        </div>
      </PixelModal>
    </>
  );
}
