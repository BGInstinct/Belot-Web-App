/** Host pause: the toolbar button and the full-table "paused" overlay. */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import type { RoomView, Seat } from '@belot/engine';
import { PixelButton } from '@/components/ui';
import { useOnline } from '../store';
import { useMyId } from '../useCreds';

export function useIsHost(room: RoomView, mySeat: Seat | null): boolean {
  const myId = useMyId();
  return room.hostId === myId || (mySeat !== null && room.seats[mySeat].player?.id === room.hostId);
}

function useTogglePause(room: RoomView) {
  const pause = useOnline((s) => s.pause);
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    await pause(!room.paused);
    setBusy(false);
  };
  return { busy, toggle };
}

/** Toolbar pause/resume button — only rendered for the host while a game is running. */
export function PauseButton({
  room,
  mySeat,
  size = 'sm',
  showLabel = false,
  className = '',
  onToggled,
}: {
  room: RoomView;
  mySeat: Seat | null;
  size?: 'sm' | 'md';
  /** icon + text (e.g. as an item of the portrait phone menu) */
  showLabel?: boolean;
  className?: string;
  onToggled?: () => void;
}) {
  const { t } = useTranslation('game');
  const isHost = useIsHost(room, mySeat);
  const { busy, toggle } = useTogglePause(room);
  if (!isHost || room.status !== 'playing') return null;
  const label = room.paused ? t('pause.resume') : t('pause.pause');
  return (
    <PixelButton
      size={size}
      variant={room.paused ? 'green' : 'orange'}
      title={label}
      aria-label={label}
      aria-pressed={room.paused}
      disabled={busy}
      onClick={() => {
        void toggle();
        onToggled?.();
      }}
      className={className}
      data-testid="pause-button"
    >
      {room.paused ? <Play size={14} className="shrink-0" /> : <Pause size={14} className="shrink-0" />}
      {showLabel && <span>{label}</span>}
    </PixelButton>
  );
}

/** Covers the whole table for everyone while the host has paused the game. */
export function PauseOverlay({ room, mySeat }: { room: RoomView; mySeat: Seat | null }) {
  const { t } = useTranslation('game');
  const isHost = useIsHost(room, mySeat);
  const { busy, toggle } = useTogglePause(room);
  if (!room.paused || room.status !== 'playing') return null;
  const hostName = room.seats.find((s) => s.player?.id === room.hostId)?.player?.name;
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-3"
      style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgb(0 0 0 / 0.25) 0 2px, transparent 2px 4px)' }}
      role="dialog"
      aria-modal="true"
      data-testid="pause-overlay"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex w-full max-w-sm flex-col items-center gap-3 border-4 border-black bg-slate-900 p-5 text-center text-white shadow-[6px_6px_0_#000]"
      >
        <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.4 }}>
          <Pause size={44} className="text-sky-300" />
        </motion.div>
        <h2 className="text-base text-balance text-sky-200 drop-shadow-[2px_2px_0_#000]">{t('pause.title')}</h2>
        <p className="text-[10px] leading-relaxed wrap-anywhere text-slate-300">
          {isHost ? t('pause.textHost') : t('pause.text', { name: hostName ?? t('pause.host') })}
        </p>
        {isHost ? (
          <PixelButton variant="green" size="lg" disabled={busy} onClick={() => void toggle()} data-testid="resume-button">
            <Play size={16} className="inline" /> {t('pause.resume')}
          </PixelButton>
        ) : (
          <p className="animate-pulse text-[9px] text-slate-400">{t('pause.waiting')}</p>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}
