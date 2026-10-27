/**
 * Portrait phone table: slim top bar (scores + controls), compact table (partner on top, opponents' backs turned 90°
 * in side columns, trick in the centre) and a bottom drawer with the action sheet + big-card hand for thumb reach.
 * Game state / handlers come from GameTable so a rotation keeps the selection.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Eye, LogOut, MessageSquare, MoreVertical, X } from 'lucide-react';
import type { Bid, Card, PlayerView, RoomView, Seat } from '@belot/engine';
import { PixelButton, PixelModal } from '@/components/ui';
import PlayingCard from '@/components/cards/PlayingCard';
import { useOnline } from '../store';
import { seatName, useViewport, type SeatPos } from '../util';
import SeatPlate from './SeatPlate';
import CardBacks from './CardBacks';
import TrickArea from './TrickArea';
import ActionBar, { type PlayControls } from './ActionBar';
import Scoreboard from './Scoreboard';
import RoundSummaryModal from './RoundSummaryModal';
import MatchEndOverlay from './MatchEndOverlay';
import ChatPanel from './ChatPanel';
import ClaimReveal from './ClaimReveal';
import { BidLabel } from './Labels';
import { useDeskBackground } from './skinAssets';
import SuitHint from './SuitHint';
import { PauseButton, PauseOverlay, useIsHost } from './PauseControls';
import { AfkBadge } from './AfkControls';
import MobileHand from './mobile/MobileHand';
import MobileAfkSheet from './mobile/MobileAfkSheet';
import { CARD_H, CARD_W, handHeight, mobileHandScale } from './mobile/handLayout';

/** seat offsets of the trick cards, in card widths / heights — tighter vertically than the desktop table */
const TRICK_SPREAD = { x: 0.62, y: 0.3 };
const even = (v: number) => 2 * Math.ceil(v / 2);
const trickBox = (s: number) => ({ w: even(CARD_W * s * (1.3 + 2 * TRICK_SPREAD.x)), h: even(CARD_H * s * (1.12 + 2 * TRICK_SPREAD.y)) });

/** fixed vertical budget used to size the hand (top bar, bidding grid, drawer padding) */
const TOP_BAR = 50;
const SHEET_MAX = 116;
const DRAWER_PAD = 14;
const SIDE_PLATE_H = 50;
const MINI_PLATE_W = 60;

function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export default function MobileTable({
  room,
  view,
  mySeat,
  positions,
  controls,
  onBid,
  onSelect,
}: {
  room: RoomView;
  view: PlayerView;
  mySeat: Seat | null;
  positions: Record<SeatPos, Seat>;
  controls: PlayControls;
  onBid: (b: Bid) => void;
  onSelect: (c: Card) => void;
}) {
  const { t } = useTranslation('game');
  const navigate = useNavigate();
  const trickHold = useOnline((s) => s.trickHold);
  const roundResult = useOnline((s) => s.roundResult);
  const roundResultPending = useOnline((s) => s.roundResultPending);
  const eventClaim = useOnline((s) => s.claim);
  const dismissRoundResult = useOnline((s) => s.dismissRoundResult);
  const leaveRoom = useOnline((s) => s.leaveRoom);
  const chatOpen = useOnline((s) => s.chatOpen);
  const setChatOpen = useOnline((s) => s.setChatOpen);
  const unread = useOnline((s) => s.unreadChat);
  const desk = useDeskBackground();
  const { w: vw, h: vh } = useViewport();
  const [tableRef, table] = useBoxSize<HTMLDivElement>();
  const [peek, setPeek] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isHost = useIsHost(room, mySeat);
  // the host gets Pause + Leave behind one "more" button so the scoreboard keeps its room on 320px screens
  const hostMenu = isHost && room.status === 'playing';

  const matchOver = view.phase === 'matchEnd' || room.status === 'finished';
  const claimInfo = view.claim ?? (view.phase !== 'bidding' ? eventClaim : null);
  const myTurnToPlay = mySeat !== null && view.phase === 'playing' && view.turn === mySeat;
  const afk = mySeat !== null && room.afkSeats.includes(mySeat);
  const canPlay = myTurnToPlay && !controls.busy && !room.paused && !afk;

  // ---- sizes (integer card scales only) ----
  const handW = vw - 12;
  const tableMin = Math.max(205, Math.round(vh * 0.33));
  const handScale = mobileHandScale(handW, vh - TOP_BAR - SHEET_MAX - DRAWER_PAD - tableMin);
  const W = (table.w || vw) - 16;
  // the backs are sized for the smallest table (bidding grid open, full hand) so they don't jump between phases
  const minTableH = vh - TOP_BAR - SHEET_MAX - DRAWER_PAD - handHeight(handScale, 2);
  const partnerScale = minTableH >= 300 ? 2 : 1;
  const row1H = Math.max(28, CARD_H * partnerScale) + 4;
  const row3H = 26;
  const minMidH = minTableH - row1H - row3H;
  const sideScale = minMidH - SIDE_PLATE_H >= CARD_W * 2 + 7 * 12 && W - 2 * CARD_H * 2 - 8 >= trickBox(2).w ? 2 : 1;
  const colW = Math.max(MINI_PLATE_W, CARD_H * sideScale);
  const midH = Math.max(0, (table.h || minTableH) - row1H - row3H);
  const centreW = W - 2 * colW - 8;
  let trickScale = 1;
  for (const s of [4, 3, 2]) {
    const b = trickBox(s);
    if (b.w <= centreW && b.h <= midH) {
      trickScale = s;
      break;
    }
  }

  const backs = (seat: Seat, vertical: boolean, side?: 'left' | 'right') => (
    <CardBacks
      count={view.handCounts[seat]}
      scale={vertical ? sideScale : partnerScale}
      maxWidth={vertical ? Math.max(CARD_W * sideScale, minMidH - SIDE_PLATE_H) : Math.min(W - 140, CARD_W * partnerScale * 4)}
      vertical={vertical}
      side={side}
      backId={room.seats[seat].player?.cardBack}
    />
  );

  const plate = (seat: Seat, pos: SeatPos, variant: 'mini' | 'chip') => (
    <div className="relative shrink-0">
      <SeatPlate info={room.seats[seat]} view={view} pos={pos} isMe={seat === mySeat} compact variant={variant} />
      {/* mini plates: centred above the 60px plate; chips: beside the plate so the name stays readable */}
      <AfkBadge
        room={room}
        seat={seat}
        short
        className={`absolute z-10 ${variant === 'mini' ? '-top-2 left-1/2 -translate-x-1/2' : 'top-1/2 left-full ml-1.5 -translate-y-1/2'}`}
      />
    </div>
  );

  // `!`: .pixel-btn is unlayered CSS, plain utilities can't override its min-height / padding
  const iconBtn = 'h-11 min-h-11! w-11 shrink-0 px-0!';
  const leaveBtn = (
    <PixelButton size="md" variant="red" className={iconBtn} title={t('leave')} aria-label={t('leave')} onClick={() => setConfirmLeave(true)}>
      <LogOut size={16} />
    </PixelButton>
  );

  return (
    <div
      className="pixelated fixed inset-0 flex flex-col overflow-hidden bg-emerald-900 select-none"
      data-testid="mobile-table"
      style={{
        backgroundImage: `url(${desk.path})`,
        backgroundRepeat: 'repeat',
        backgroundSize: `${desk.width * 3}px ${desk.height * 3}px`,
        imageRendering: 'pixelated',
      }}
    >
      {/* top bar: compact scoreboard + controls */}
      <div className="relative z-30 flex shrink-0 items-stretch gap-1.5 px-1.5 pb-0.5" style={{ paddingTop: 'max(4px, env(safe-area-inset-top))' }}>
        <div className="flex min-w-0 flex-1">
          <Scoreboard view={view} room={room} mySeat={mySeat} compact variant="bar" />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <PixelButton size="md" variant="dark" className={iconBtn} title={t('lastTrick')} aria-label={t('lastTrick')} disabled={!view.lastTrick} onClick={() => setPeek((p) => !p)}>
            <Eye size={16} />
          </PixelButton>
          <PixelButton size="md" variant="dark" title={t('chat')} aria-label={t('chat')} onClick={() => setChatOpen(!chatOpen)} className={`relative ${iconBtn}`}>
            <MessageSquare size={16} />
            {unread > 0 && <span className="absolute -top-2 -right-2 bg-red-600 px-1 text-[8px] text-white">{unread}</span>}
          </PixelButton>
          {hostMenu ? (
            <PixelButton
              size="md"
              variant={room.paused ? 'green' : 'dark'}
              className={iconBtn}
              title={t('mobile.menu')}
              aria-label={t('mobile.menu')}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((o) => !o)}
              data-testid="mobile-menu-button"
            >
              <MoreVertical size={16} />
            </PixelButton>
          ) : (
            leaveBtn
          )}
        </div>
        {hostMenu && menuOpen && (
          <>
            <div className="fixed inset-0 z-0" onClick={() => setMenuOpen(false)} />
            <div
              role="menu"
              className="absolute top-full right-1.5 z-10 mt-1 flex w-max max-w-[calc(100vw-12px)] flex-col gap-1.5 border-4 border-black bg-slate-950/95 p-1.5 shadow-[4px_4px_0_#000]"
              data-testid="mobile-menu"
            >
              <PauseButton
                room={room}
                mySeat={mySeat}
                size="md"
                showLabel
                className="min-h-11! w-full justify-start! whitespace-normal! text-left leading-tight"
                onToggled={() => setMenuOpen(false)}
              />
              <PixelButton
                size="md"
                variant="red"
                className="min-h-11! w-full justify-start! whitespace-normal! text-left leading-tight"
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmLeave(true);
                }}
              >
                <LogOut size={14} className="shrink-0" />
                <span>{t('leave')}</span>
              </PixelButton>
            </div>
          </>
        )}
      </div>

      {/* table: partner on top · left column · centre · right column · own plate */}
      <div ref={tableRef} className="relative flex min-h-0 flex-1 flex-col px-2">
        <div className="flex shrink-0 items-center justify-center gap-2" style={{ height: row1H }}>
          {plate(positions.top, 'top', 'chip')}
          {backs(positions.top, false)}
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-between gap-1">
          <div className="flex shrink-0 flex-col items-center gap-1" style={{ width: colW }}>
            {plate(positions.left, 'left', 'mini')}
            {backs(positions.left, true, 'left')}
          </div>

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center self-stretch">
            {view.phase === 'bidding' ? (
              <MobileBidHistory view={view} room={room} rows={midH >= 150 ? 6 : 4} />
            ) : (
              <TrickArea trick={view.currentTrick} hold={trickHold} mySeat={mySeat} scale={trickScale} spread={TRICK_SPREAD} />
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center gap-1" style={{ width: colW }}>
            {plate(positions.right, 'right', 'mini')}
            {backs(positions.right, true, 'right')}
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-center" style={{ height: row3H }}>
          {plate(positions.bottom, 'bottom', 'chip')}
        </div>

        <div className="absolute top-1 left-1.5 z-20">
          <SuitHint compact />
        </div>

        {claimInfo && view.phase !== 'bidding' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center px-1.5">
            <ClaimReveal claim={claimInfo} room={room} mySeat={mySeat} contract={view.contract} scale={2} compact={false} />
          </div>
        )}

        {peek && view.lastTrick && (
          <div className="absolute top-1 right-1.5 z-30 flex flex-col gap-1 border-4 border-black bg-slate-950/95 p-2 shadow-[4px_4px_0_#000]" data-testid="last-trick">
            <div className="flex items-center justify-between gap-2 text-[9px] text-amber-200">
              {t('lastTrick')}
              <button type="button" onClick={() => setPeek(false)} aria-label={t('close')} className="-m-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center text-slate-300">
                <X size={14} />
              </button>
            </div>
            <div className="flex gap-1">
              {view.lastTrick.plays.map((p) => (
                <div key={p.seat} className="flex flex-col items-center gap-0.5">
                  <PlayingCard card={p.card} scale={W >= 380 ? 3 : 2} noHover highlighted={p.seat === view.lastTrick?.winner} />
                  <span className="max-w-[56px] truncate text-[7px] text-slate-300">{p.seat === mySeat ? t('you') : seatName(room, p.seat, t('bot'), '?')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* bottom drawer: action sheet (turn timer, bids, play / belot / announce / claim) + hand */}
      <div
        className="relative z-10 flex shrink-0 flex-col gap-1.5 border-t-4 border-black bg-slate-950/90 px-1.5 pt-1.5 shadow-[0_-4px_0_rgb(0_0_0/0.35)]"
        style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}
        data-testid="mobile-drawer"
      >
        {mySeat !== null ? (
          <>
            <ActionBar view={view} room={room} mySeat={mySeat} onBid={onBid} controls={controls} compact mobile />
            <MobileHand
              hand={view.hand}
              contract={view.contract}
              legalCards={view.legalCards}
              canPlay={canPlay}
              selected={controls.selected}
              onSelect={onSelect}
              scale={handScale}
              width={handW}
            />
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 py-1">
            <span className="text-[10px] text-slate-200">{t('spectating')}</span>
            {backs(positions.bottom, false)}
          </div>
        )}
      </div>

      {chatOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={() => setChatOpen(false)}>
          <div
            className="flex h-[60dvh] flex-col gap-2 border-t-4 border-black bg-slate-900/95 px-2 pt-2 shadow-[0_-4px_0_#000]"
            style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
            data-testid="mobile-chat"
          >
            <div className="flex items-center justify-between text-[10px] text-amber-200">
              {t('chat')}
              <button type="button" className="-m-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center" onClick={() => setChatOpen(false)} aria-label={t('close')}>
                <X size={16} />
              </button>
            </div>
            <ChatPanel className="flex-1" touch />
          </div>
        </div>
      )}

      <RoundSummaryModal result={roundResult} view={view} room={room} mySeat={mySeat} onClose={dismissRoundResult} sheet />
      <MobileAfkSheet room={room} mySeat={mySeat} />
      <PauseOverlay room={room} mySeat={mySeat} />
      {matchOver && !roundResult && !roundResultPending && <MatchEndOverlay view={view} room={room} mySeat={mySeat} mobile />}

      <PixelModal open={confirmLeave} onClose={() => setConfirmLeave(false)} title={t('leaveTitle')}>
        <div className="flex flex-col gap-3 text-[10px]">
          <p className="leading-relaxed">{t('leaveText')}</p>
          <div className="flex flex-wrap gap-2">
            <PixelButton
              variant="red"
              className="min-h-11! min-w-fit flex-1"
              onClick={async () => {
                setConfirmLeave(false);
                await leaveRoom();
                navigate('/play');
              }}
            >
              {t('leave')}
            </PixelButton>
            <PixelButton variant="dark" className="min-h-11! min-w-fit flex-1" onClick={() => setConfirmLeave(false)}>
              {t('cancel')}
            </PixelButton>
          </div>
        </div>
      </PixelModal>
    </div>
  );
}

function MobileBidHistory({ view, room, rows }: { view: PlayerView; room: RoomView; rows: number }) {
  const { t } = useTranslation('game');
  const bids = view.bids.slice(-rows);
  return (
    <div className="flex w-full max-w-[200px] flex-col gap-1 border-4 border-black bg-slate-950/80 p-1.5 text-[9px] text-slate-100 shadow-[3px_3px_0_#000]" data-testid="bid-history">
      <span className="text-center text-amber-200">{t('bidding')}</span>
      {bids.length === 0 && <span className="text-center text-slate-400">{t('noBidsYet')}</span>}
      {bids.map((b, i) => (
        <div key={view.bids.length - bids.length + i} className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-slate-300">{b.seat === view.seat ? t('you') : seatName(room, b.seat, t('bot'), '?')}</span>
          <span className={`shrink-0 ${b.bid.kind === 'pass' ? 'text-slate-400' : 'text-amber-300'}`}>
            <BidLabel bid={b.bid} iconSize={12} />
          </span>
        </div>
      ))}
    </div>
  );
}
