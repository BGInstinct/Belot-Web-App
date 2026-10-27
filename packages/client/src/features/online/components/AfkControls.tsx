/** AFK: "you were marked AFK" overlay with the I'm Back button, and a small badge for other seats. */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Bot, Hand } from 'lucide-react';
import type { RoomView, Seat } from '@belot/engine';
import { PixelButton } from '@/components/ui';
import { useOnline } from '../store';

/** Shown to me while my seat is in `room.afkSeats`. Dims the table but keeps it visible. */
export function AfkOverlay({ room, mySeat }: { room: RoomView; mySeat: Seat | null }) {
  const { t } = useTranslation('game');
  const imBack = useOnline((s) => s.imBack);
  const [busy, setBusy] = useState(false);
  if (mySeat === null || room.status !== 'playing' || !room.afkSeats.includes(mySeat)) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[65] flex items-center justify-center bg-black/40 p-3" data-testid="afk-overlay">
      <motion.div
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        role="alertdialog"
        aria-labelledby="afk-title"
        className="pointer-events-auto flex w-full max-w-sm flex-col items-center gap-3 border-4 border-black bg-orange-950/95 p-4 text-center text-white shadow-[6px_6px_0_#000]"
      >
        <div className="flex items-center gap-2">
          <Bot size={28} className="text-orange-300" />
          <h2 id="afk-title" className="text-sm text-orange-200 drop-shadow-[2px_2px_0_#000]">
            {t('afk.title')}
          </h2>
        </div>
        <p className="text-[10px] leading-relaxed text-orange-100">{t('afk.text')}</p>
        <PixelButton
          variant="green"
          size="lg"
          block
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await imBack();
            setBusy(false);
          }}
          data-testid="imback-button"
        >
          <Hand size={16} className="inline" /> {t('afk.imBack')}
        </PixelButton>
        <p className="text-[8px] text-orange-300/80">{t('afk.hint')}</p>
      </motion.div>
    </div>,
    document.body,
  );
}

/** "AFK — bot playing" chip for a seat; renders nothing if the seat isn't AFK. `short`: icon + "AFK" only (portrait phone plates). */
export function AfkBadge({ room, seat, className = '', short = false }: { room: RoomView; seat: Seat; className?: string; short?: boolean }) {
  const { t } = useTranslation('game');
  if (!room.afkSeats.includes(seat)) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 border-2 border-black bg-orange-600 px-1 py-0.5 text-[7px] leading-none whitespace-nowrap text-white shadow-[2px_2px_0_#000] sm:text-[8px] ${className}`}
      title={t('afk.badgeTitle')}
      data-testid={`afk-badge-${seat}`}
    >
      <Bot size={10} /> {short ? t('mobile.afkBadge') : t('afk.badge')}
    </span>
  );
}
