import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Crown, WifiOff, X } from 'lucide-react';
import type { PlayerView, SeatInfo } from '@belot/engine';
import { useOnline, type Bubble } from '../store';
import { teamOf, type SeatPos } from '../util';
import Avatar from './Avatar';
import { AnnouncementLabel, BidLabel } from './Labels';

const BUBBLE_POS: Record<SeatPos, string> = {
  bottom: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  top: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'left-full top-1/2 ml-2 -translate-y-1/2',
  right: 'right-full top-1/2 mr-2 -translate-y-1/2',
};

/** portrait phone partner chip sits left of its card backs, so its bubble grows rightwards (stays on screen) */
const CHIP_TOP_BUBBLE = 'top-full left-0 mt-2';

/** Name plate: avatar, name, dealer marker, turn glow, connection, declarer crown, speech bubbles. */
export default function SeatPlate({
  info,
  view,
  pos,
  isMe,
  compact,
  variant = 'default',
}: {
  info: SeatInfo;
  view: PlayerView;
  pos: SeatPos;
  isMe: boolean;
  compact: boolean;
  /**
   * portrait phone plates: `mini` = avatar over a short name (left/right columns),
   * `chip` = one slim row (partner on top, own seat)
   */
  variant?: 'default' | 'mini' | 'chip';
}) {
  const { t } = useTranslation('game');
  const bubble = useOnline((s) => s.bubbles.find((b) => b.seat === info.seat));
  const active = view.turn === info.seat && (view.phase === 'bidding' || view.phase === 'playing');
  const isDealer = view.dealer === info.seat;
  const isDeclarer = view.declarer === info.seat && view.contract !== null;
  const team = teamOf(info.seat);
  const name = info.player?.name ?? (info.isBot ? `${t('bot')} ${info.seat + 1}` : t('emptySeat'));
  const declared = view.declared.filter((d) => d.seat === info.seat);
  const small = variant !== 'default';
  const marker = small ? 'h-4 w-4 text-[8px] -top-1.5 -left-1.5' : 'h-5 w-5 text-[9px] -top-2 -left-2';

  return (
    <div className="relative">
      <motion.div
        animate={active ? { boxShadow: ['0 0 0 0 #fbbf24', '0 0 0 4px #fbbf24', '0 0 0 0 #fbbf24'] } : { boxShadow: '0 0 0 0 rgba(0,0,0,0)' }}
        transition={active ? { duration: 1.2, repeat: Infinity } : { duration: 0.2 }}
        className={`flex items-center border-black ${
          variant === 'mini'
            ? 'w-[60px] flex-col gap-0.5 border-2 px-0.5 pt-1 pb-0.5 shadow-[2px_2px_0_#000]'
            : variant === 'chip'
              ? 'gap-1 border-2 py-0.5 pr-1.5 pl-0.5 shadow-[2px_2px_0_#000]'
              : 'gap-1.5 border-4 px-1.5 py-1 shadow-[3px_3px_0_#000]'
        } ${team === 0 ? 'bg-sky-950/90' : 'bg-rose-950/90'}`}
        data-seat-plate={info.seat}
      >
        <Avatar info={info} size={variant === 'mini' ? 24 : variant === 'chip' ? 20 : compact ? 26 : 36} />
        <div className={`flex min-w-0 flex-col ${variant === 'mini' ? 'w-full items-center' : ''}`}>
          <span
            className={`truncate ${
              variant === 'mini' ? 'max-w-full text-[7px] leading-tight' : variant === 'chip' ? 'max-w-[96px] text-[8px] leading-tight' : 'max-w-[90px] text-[9px] sm:max-w-[130px] sm:text-[10px]'
            } ${isMe ? 'text-amber-300' : 'text-white'}`}
          >
            {isMe ? t('you') : name}
          </span>
          <span className={`flex items-center gap-1 ${small ? 'absolute -right-1.5 -bottom-1.5 text-[8px]' : 'text-[8px]'}`}>
            {!small && <span className={team === 0 ? 'text-sky-300' : 'text-rose-300'}>{t(`team${team}`)}</span>}
            {!info.isBot && info.player && !info.connected && (
              <span className="flex items-center gap-0.5 text-red-400" title={t('disconnected')}>
                <WifiOff size={9} />
              </span>
            )}
          </span>
        </div>
        {isDealer && (
          <span title={t('dealer')} className={`absolute ${marker} flex items-center justify-center border-2 border-black bg-white text-black shadow-[2px_2px_0_#000]`}>
            {t('dealerShort')}
          </span>
        )}
        {isDeclarer && (
          <span
            title={t('declarer')}
            className={`absolute flex items-center justify-center border-2 border-black bg-amber-400 text-black shadow-[2px_2px_0_#000] ${small ? '-top-1.5 -right-1.5 h-4 w-4' : '-top-2 -right-2 h-5 w-5'}`}
          >
            <Crown size={small ? 9 : 11} />
          </span>
        )}
      </motion.div>

      {declared.length > 0 && view.phase === 'playing' && !compact && !small && (
        <div className="mt-1 flex max-w-[180px] flex-wrap gap-1">
          {declared.map((d, i) => (
            <span key={i} className="border-2 border-black bg-amber-200 px-1 text-[7px] text-black">
              {t(`announcements.${d.announcement.type}`)}
            </span>
          ))}
        </div>
      )}

      <AnimatePresence>
        {bubble && (
          <motion.div
            key={bubble.id}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            className={`pointer-events-none absolute z-40 ${variant === 'chip' && pos === 'top' ? CHIP_TOP_BUBBLE : BUBBLE_POS[pos]}`}
          >
            <SpeechBubble bubble={bubble} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SpeechBubble({ bubble }: { bubble: Bubble }) {
  const { t } = useTranslation('game');
  if (bubble.kind === 'claim') {
    return (
      <div
        className={`relative w-max border-4 border-black px-2 py-1 text-[10px] whitespace-nowrap text-white shadow-[3px_3px_0_#000] ${bubble.success ? 'bg-emerald-600' : 'bg-red-700'}`}
      >
        <span className="flex items-center gap-1">
          {t('claim.bubble')} {bubble.success ? <Check size={12} /> : <X size={12} />}
        </span>
      </div>
    );
  }
  const special = bubble.kind === 'announce' || (bubble.kind === 'bid' && bubble.bid.kind !== 'pass' && bubble.bid.kind !== 'contract');
  return (
    <div
      className={`relative w-max border-4 border-black px-2 py-1 text-[10px] whitespace-nowrap shadow-[3px_3px_0_#000] ${
        special ? 'bg-amber-300 text-black' : bubble.kind === 'bid' && bubble.bid.kind === 'pass' ? 'bg-slate-200 text-slate-700' : 'bg-white text-black'
      }`}
    >
      {bubble.kind === 'bid' ? <BidLabel bid={bubble.bid} onDark={false} /> : <AnnouncementLabel a={bubble.announcement} onDark={false} />}
    </div>
  );
}
