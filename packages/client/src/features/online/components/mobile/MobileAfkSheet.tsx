/** Portrait phone variant of the AFK overlay: the table stays visible, the I'm Back button sits at the bottom for thumb reach. */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Bot, Hand } from 'lucide-react';
import type { RoomView, Seat } from '@belot/engine';
import { PixelButton } from '@/components/ui';
import { useOnline } from '../../store';

export default function MobileAfkSheet({ room, mySeat }: { room: RoomView; mySeat: Seat | null }) {
  const { t } = useTranslation('game');
  const imBack = useOnline((s) => s.imBack);
  const [busy, setBusy] = useState(false);
  if (mySeat === null || room.status !== 'playing' || !room.afkSeats.includes(mySeat)) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[65] flex flex-col justify-end bg-black/40" data-testid="afk-overlay">
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        role="alertdialog"
        aria-labelledby="afk-title"
        className="pointer-events-auto flex w-full flex-col items-center gap-2 border-t-4 border-black bg-orange-950/95 px-3 pt-3 text-center text-white shadow-[0_-4px_0_#000]"
        style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
      >
        <div className="flex max-w-full items-center gap-2">
          <Bot size={24} className="shrink-0 text-orange-300" />
          <h2 id="afk-title" className="min-w-0 text-sm leading-snug text-balance text-orange-200 drop-shadow-[2px_2px_0_#000]">
            {t('afk.title')}
          </h2>
        </div>
        <p className="text-[10px] leading-relaxed text-balance text-orange-100">{t('afk.text')}</p>
        <p className="text-[8px] leading-relaxed text-balance text-orange-300/80">{t('afk.hint')}</p>
        <PixelButton
          variant="green"
          size="lg"
          block
          className="min-h-12! whitespace-normal! leading-tight"
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
      </motion.div>
    </div>,
    document.body,
  );
}
