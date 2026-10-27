/** In-game table: rotated seats (own seat at the bottom, seat+1 on the right), hands, trick, action bar, overlays. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Eye, Loader2, LogOut, MessageSquare, X } from 'lucide-react';
import { sameCard, type Announcement, type Bid, type Card, type RoomView, type Seat } from '@belot/engine';
import { PixelButton, PixelModal } from '@/components/ui';
import PlayingCard from '@/components/cards/PlayingCard';
import { useOnline } from '../store';
import { useMyId } from '../useCreds';
import { findMySeat, relPos, SEATS, seatName, useCardScales, useViewport, type SeatPos } from '../util';
import SeatPlate from './SeatPlate';
import CardBacks from './CardBacks';
import MyHand from './MyHand';
import TrickArea from './TrickArea';
import ActionBar, { type PlayControls } from './ActionBar';
import Scoreboard from './Scoreboard';
import RoundSummaryModal from './RoundSummaryModal';
import MatchEndOverlay from './MatchEndOverlay';
import ChatPanel from './ChatPanel';
import { BidLabel } from './Labels';
import { useDeskBackground } from './skinAssets';
import SuitHint from './SuitHint';
import ClaimReveal from './ClaimReveal';
import { PauseButton, PauseOverlay } from './PauseControls';
import { AfkBadge, AfkOverlay } from './AfkControls';
import MobileTable from './MobileTable';
import { useIsPortraitPhone } from '../useIsPortraitPhone';

export default function GameTable({ room }: { room: RoomView }) {
  const { t } = useTranslation('game');
  const navigate = useNavigate();
  const view = useOnline((s) => s.view);
  const trickHold = useOnline((s) => s.trickHold);
  const roundResult = useOnline((s) => s.roundResult);
  const roundResultPending = useOnline((s) => s.roundResultPending);
  const eventClaim = useOnline((s) => s.claim);
  const dismissRoundResult = useOnline((s) => s.dismissRoundResult);
  const act = useOnline((s) => s.act);
  const leaveRoom = useOnline((s) => s.leaveRoom);
  const chatOpen = useOnline((s) => s.chatOpen);
  const setChatOpen = useOnline((s) => s.setChatOpen);
  const unread = useOnline((s) => s.unreadChat);
  const scales = useCardScales();
  const { w: vw } = useViewport();
  const desk = useDeskBackground();
  const portraitPhone = useIsPortraitPhone();

  const myId = useMyId();
  const mySeat = findMySeat(room, myId, view?.seat);
  const [selected, setSelected] = useState<Card | null>(null);
  const [belot, setBelot] = useState(false);
  const [chosen, setChosen] = useState<Announcement[]>([]);
  const [busy, setBusy] = useState(false);
  const [peek, setPeek] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const myTurnToPlay = !!view && mySeat !== null && view.phase === 'playing' && view.turn === mySeat;
  const turnKey = `${view?.roundNumber}-${view?.turn}-${view?.hand.length}-${view?.phase}`;
  const lastTurnKey = useRef(turnKey);
  useEffect(() => {
    if (lastTurnKey.current === turnKey) return;
    lastTurnKey.current = turnKey;
    setSelected(null);
    setBelot(false);
    if (!view?.availableAnnouncements.length) setChosen([]);
  }, [turnKey, view?.availableAnnouncements.length]);
  // new round → forget chosen announcements
  useEffect(() => setChosen([]), [view?.roundNumber]);

  const play = useCallback(
    async (card?: Card) => {
      const c = card ?? selected;
      if (!c || !view || busy) return;
      const manual = view.settings.manualAnnounceOnly;
      setBusy(true);
      const ok = await act({
        type: 'play',
        card: c,
        ...(manual && chosen.length ? { announcements: chosen } : {}),
        ...(manual && belot ? { belot: true } : {}),
      });
      setBusy(false);
      if (ok) {
        setSelected(null);
        setBelot(false);
        setChosen([]);
      }
    },
    [selected, view, busy, act, chosen, belot],
  );

  const claim = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const ok = await act({ type: 'claim' });
    setBusy(false);
    if (ok) {
      setSelected(null);
      setBelot(false);
      setChosen([]);
    }
  }, [busy, act]);

  const onBid = useCallback(
    async (bid: Bid) => {
      setBusy(true);
      await act({ type: 'bid', bid });
      setBusy(false);
    },
    [act],
  );

  const onSelect = useCallback(
    (c: Card) => {
      // tap a selected card again to play it
      if (selected && sameCard(selected, c)) void play(c);
      else {
        setSelected(c);
        setBelot(false);
      }
    },
    [selected, play],
  );

  const controls: PlayControls = { selected, belot, setBelot, chosen, setChosen, play: () => void play(), claim: () => void claim(), busy };

  const positions = useMemo(() => {
    const m: Record<SeatPos, Seat> = { bottom: 0, right: 1, top: 2, left: 3 };
    for (const s of SEATS) m[relPos(s, mySeat)] = s;
    return m;
  }, [mySeat]);

  if (!view) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-emerald-900 text-xs text-white">
        <Loader2 className="mr-2 animate-spin" size={18} /> {t('loading')}
      </div>
    );
  }

  // portrait phones get their own vertical layout (same state + handlers)
  if (portraitPhone) {
    return <MobileTable room={room} view={view} mySeat={mySeat} positions={positions} controls={controls} onBid={onBid} onSelect={onSelect} />;
  }

  const bottomSeat = positions.bottom;
  const handMaxW = Math.min(vw - 16, scales.hand * 23 * 8);
  const sideMax = scales.compact ? 60 : scales.side * 23 * 3;
  // room for the partner plate to hang left of the centred backs without reaching the scoreboard
  const topPlateAside = !scales.compact && vw >= 1100;
  const matchOver = view.phase === 'matchEnd' || room.status === 'finished';
  // the view's claim is authoritative; the event copy covers the moment before the new state arrives
  const claimInfo = view.claim ?? (view.phase !== 'bidding' ? eventClaim : null);

  const opponentHand = (seat: Seat, vertical: boolean, side?: 'left' | 'right') => (
    <CardBacks
      count={view.handCounts[seat]}
      scale={vertical ? scales.side : scales.back}
      maxWidth={vertical ? sideMax : scales.compact ? 110 : scales.back * 23 * 4}
      vertical={vertical}
      side={side}
      backId={room.seats[seat].player?.cardBack}
    />
  );

  const plate = (seat: Seat, pos: SeatPos) => (
    <div className="relative">
      <SeatPlate info={room.seats[seat]} view={view} pos={pos} isMe={seat === mySeat} compact={scales.compact} />
      <AfkBadge room={room} seat={seat} className="absolute -top-2 left-1/2 z-10 -translate-x-1/2" />
    </div>
  );

  return (
    <div
      className="pixelated fixed inset-0 flex flex-col overflow-hidden bg-emerald-900 select-none"
      style={{
        backgroundImage: `url(${desk.path})`,
        backgroundRepeat: 'repeat',
        backgroundSize: `${desk.width * (scales.compact ? 3 : 4)}px ${desk.height * (scales.compact ? 3 : 4)}px`,
        imageRendering: 'pixelated',
      }}
    >
      {/* top bar: scoreboard (left), partner/top seat (centre), controls (right) */}
      <div className="relative flex shrink-0 items-start justify-between gap-2 p-1.5 sm:p-2">
        <Scoreboard view={view} room={room} mySeat={mySeat} compact={scales.compact} />
        {/* desktop: plate beside the (big) partner backs so the row stays short and the speech bubble lands next to them;
            on wide screens the plate hangs off the left so the backs stay centred above the trick */}
        <div className={`relative flex gap-1 pt-1 ${scales.compact ? 'flex-col items-center' : 'flex-row items-start gap-2'}`}>
          {topPlateAside ? <div className="absolute top-1 right-full mr-2">{plate(positions.top, 'top')}</div> : plate(positions.top, 'top')}
          {opponentHand(positions.top, false)}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-1">
            <PixelButton size="sm" variant="dark" title={t('lastTrick')} disabled={!view.lastTrick} onClick={() => setPeek((p) => !p)}>
              <Eye size={14} />
            </PixelButton>
            <PauseButton room={room} mySeat={mySeat} />
            <PixelButton size="sm" variant="dark" title={t('chat')} onClick={() => setChatOpen(!chatOpen)} className="relative">
              <MessageSquare size={14} />
              {unread > 0 && <span className="absolute -top-2 -right-2 bg-red-600 px-1 text-[8px] text-white">{unread}</span>}
            </PixelButton>
            <PixelButton size="sm" variant="red" title={t('leave')} onClick={() => setConfirmLeave(true)}>
              <LogOut size={14} />
            </PixelButton>
          </div>
          {/* Suit equivalence hint badge (from the foundation agent) */}
          <SuitHint compact={scales.compact} />
        </div>
      </div>

      {/* middle: left seat · centre (trick / bidding) · right seat */}
      <div className="relative flex min-h-0 flex-1 items-center justify-between gap-1 px-1.5 sm:px-3">
        <div className={`flex gap-1 ${scales.compact ? 'flex-row items-center' : 'flex-col items-start'}`}>
          {plate(positions.left, 'left')}
          {opponentHand(positions.left, true, 'left')}
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
          {view.phase === 'bidding' ? (
            <BidHistory view={view} room={room} compact={scales.compact} />
          ) : claimInfo ? (
            <ClaimReveal claim={claimInfo} room={room} mySeat={mySeat} contract={view.contract} scale={scales.trick} compact={scales.compact} />
          ) : (
            <TrickArea trick={view.currentTrick} hold={trickHold} mySeat={mySeat} scale={scales.trick} tight={scales.compact} />
          )}
          {peek && view.lastTrick && (
            <div className="absolute top-1 right-1 z-30 flex flex-col gap-1 border-4 border-black bg-slate-950/95 p-2 shadow-[4px_4px_0_#000]">
              <div className="flex items-center justify-between gap-2 text-[9px] text-amber-200">
                {t('lastTrick')}
                <button type="button" onClick={() => setPeek(false)} aria-label={t('close')} className="cursor-pointer text-slate-300">
                  <X size={12} />
                </button>
              </div>
              <div className="flex gap-1">
                {view.lastTrick.plays.map((p) => (
                  <div key={p.seat} className="flex flex-col items-center gap-0.5">
                    <PlayingCard card={p.card} scale={scales.compact ? 1 : 2} highlighted={p.seat === view.lastTrick?.winner} />
                    <span className="max-w-[50px] truncate text-[7px] text-slate-300">{p.seat === mySeat ? t('you') : seatName(room, p.seat, t('bot'), '?')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={`flex gap-1 ${scales.compact ? 'flex-row-reverse items-center' : 'flex-col items-end'}`}>
          {plate(positions.right, 'right')}
          {opponentHand(positions.right, true, 'right')}
        </div>
      </div>

      {/* bottom: own plate + action bar + hand */}
      <div className="flex shrink-0 flex-col items-center gap-1 px-1.5 pb-1">
        <div className="flex w-full items-end justify-center gap-2">
          <div className="hidden sm:block">{plate(bottomSeat, 'bottom')}</div>
          {mySeat !== null ? (
            <ActionBar view={view} room={room} mySeat={mySeat} onBid={onBid} controls={controls} compact={scales.compact} />
          ) : (
            <div className="border-4 border-black bg-slate-950/85 px-3 py-1 text-[10px] text-slate-200">{t('spectating')}</div>
          )}
        </div>
        {mySeat !== null ? (
          <MyHand
            hand={view.hand}
            contract={view.contract}
            legalCards={view.legalCards}
            canPlay={myTurnToPlay && !busy && !room.paused && !room.afkSeats.includes(mySeat)}
            selected={selected}
            onSelect={onSelect}
            scale={scales.hand}
            maxWidth={handMaxW}
          />
        ) : (
          opponentHand(bottomSeat, false)
        )}
      </div>

      {chatOpen && (
        <div className="absolute top-14 right-2 bottom-2 z-50 flex w-[min(320px,90vw)] flex-col gap-2 border-4 border-black bg-slate-900/95 p-2 shadow-[4px_4px_0_#000]">
          <div className="flex items-center justify-between text-[10px] text-amber-200">
            {t('chat')}
            <button type="button" className="cursor-pointer" onClick={() => setChatOpen(false)} aria-label={t('close')}>
              <X size={14} />
            </button>
          </div>
          <ChatPanel className="flex-1" />
        </div>
      )}

      <RoundSummaryModal result={roundResult} view={view} room={room} mySeat={mySeat} onClose={dismissRoundResult} />
      <AfkOverlay room={room} mySeat={mySeat} />
      <PauseOverlay room={room} mySeat={mySeat} />
      {matchOver && !roundResult && !roundResultPending && <MatchEndOverlay view={view} room={room} mySeat={mySeat} />}

      <PixelModal open={confirmLeave} onClose={() => setConfirmLeave(false)} title={t('leaveTitle')}>
        <div className="flex flex-col gap-3 text-[10px]">
          <p className="leading-relaxed">{t('leaveText')}</p>
          <div className="flex gap-2">
            <PixelButton
              variant="red"
              onClick={async () => {
                setConfirmLeave(false);
                await leaveRoom();
                navigate('/play');
              }}
            >
              {t('leave')}
            </PixelButton>
            <PixelButton variant="dark" onClick={() => setConfirmLeave(false)}>
              {t('cancel')}
            </PixelButton>
          </div>
        </div>
      </PixelModal>
    </div>
  );
}

function BidHistory({ view, room, compact }: { view: NonNullable<ReturnType<typeof useOnline.getState>['view']>; room: RoomView; compact: boolean }) {
  const { t } = useTranslation('game');
  const bids = view.bids.slice(compact ? -4 : -8);
  return (
    <div className="flex min-w-[160px] flex-col gap-1 border-4 border-black bg-slate-950/80 p-2 text-[9px] text-slate-100 shadow-[4px_4px_0_#000] sm:text-[10px]">
      <span className="text-center text-amber-200">{t('bidding')}</span>
      {bids.length === 0 && <span className="text-center text-slate-400">{t('noBidsYet')}</span>}
      {bids.map((b, i) => (
        <div key={view.bids.length - bids.length + i} className="flex items-center justify-between gap-3">
          <span className="max-w-[100px] truncate text-slate-300">{b.seat === view.seat ? t('you') : seatName(room, b.seat, t('bot'), '?')}</span>
          <span className={b.bid.kind === 'pass' ? 'text-slate-400' : 'text-amber-300'}>
            <BidLabel bid={b.bid} />
          </span>
        </div>
      ))}
    </div>
  );
}
