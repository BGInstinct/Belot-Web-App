/** Contextual action bar: bidding buttons, play / Belot / Announce controls, turn status + timer. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, Hand, Sparkles, Trophy, Eye, AlertTriangle } from 'lucide-react';
import type { Announcement, Bid, Card, Contract, PlayerView, RoomView, Seat } from '@belot/engine';
import { PixelButton, PixelModal, PixelToggle } from '@/components/ui';
import { BidLabel, AnnouncementLabel, ContractLabel } from './Labels';
import TurnTimer from './TurnTimer';
import { canDeclareBelot } from '@belot/engine';
import { annKey, annOverlaps, sameBid, seatName } from '../util';

const CONTRACTS: Contract[] = [
  { kind: 'suit', suit: 'C' },
  { kind: 'suit', suit: 'D' },
  { kind: 'suit', suit: 'H' },
  { kind: 'suit', suit: 'S' },
  { kind: 'NT' },
  { kind: 'AT' },
];

export interface PlayControls {
  selected: Card | null;
  belot: boolean;
  setBelot: (v: boolean) => void;
  chosen: Announcement[];
  setChosen: (a: Announcement[]) => void;
  play: () => void;
  /** Claim All (Прибиране) — sends `{ type: 'claim' }` */
  claim: () => void;
  busy: boolean;
}

export default function ActionBar({
  view,
  room,
  mySeat,
  onBid,
  controls,
  compact,
  mobile = false,
}: {
  view: PlayerView;
  room: RoomView;
  mySeat: Seat | null;
  onBid: (b: Bid) => void;
  controls: PlayControls;
  compact: boolean;
  /** portrait-phone action sheet: full width, stacked status/timer, ≥44px tap targets in a grid */
  mobile?: boolean;
}) {
  const { t } = useTranslation('game');
  const myTurn = mySeat !== null && view.turn === mySeat;
  const turnName = view.turn !== null ? seatName(room, view.turn, t('bot'), t('emptySeat')) : '';
  const paused = room.paused;
  const timer = (
    <TurnTimer deadline={room.turnDeadline} totalSeconds={room.settings.turnTimerSeconds} paused={paused} pausedRemainingMs={room.pausedRemainingMs} className="w-full" />
  );
  // while paused (or the bot plays for an AFK me) the action buttons are disabled
  const afk = mySeat !== null && room.afkSeats.includes(mySeat);
  const locked = controls.busy || paused || afk;
  const ctl = locked === controls.busy ? controls : { ...controls, busy: true };

  let body: React.ReactNode = null;
  if (view.phase === 'bidding') {
    body = myTurn ? <BiddingButtons view={view} onBid={onBid} busy={locked} compact={compact} mobile={mobile} /> : <Waiting text={t('waitingBid', { name: turnName })} mobile={mobile} />;
  } else if (view.phase === 'playing') {
    body = myTurn ? <PlayingButtons view={view} controls={ctl} mobile={mobile} /> : <Waiting text={t('waitingPlay', { name: turnName })} mobile={mobile} />;
  } else if (view.phase === 'roundEnd') {
    body = <Waiting text={t('roundOver')} mobile={mobile} />;
  }

  if (mobile) {
    const bidGrid = view.phase === 'bidding' && myTurn;
    return (
      <div className="flex w-full flex-col gap-1.5" data-testid="mobile-action-sheet" data-my-turn={myTurn}>
        {(view.phase === 'bidding' || view.phase === 'playing') && (
          <div className="flex min-w-0 items-center gap-2 text-[9px]">
            <span className={`max-w-[60%] min-w-0 shrink-0 truncate ${paused ? 'text-sky-300' : myTurn ? 'animate-pulse text-amber-300' : 'text-slate-300'}`}>
              {paused ? t('pause.short') : myTurn ? (afk ? t('afk.botPlaying') : t('yourTurn')) : t('turnOf', { name: turnName })}
            </span>
            <TurnTimer deadline={room.turnDeadline} totalSeconds={room.settings.turnTimerSeconds} paused={paused} pausedRemainingMs={room.pausedRemainingMs} className="min-w-0 flex-1" />
          </div>
        )}
        <div className={bidGrid ? 'grid grid-cols-12 gap-1' : 'flex min-h-11 flex-wrap items-center justify-center gap-1 text-center'}>{body}</div>
      </div>
    );
  }

  return (
    <div className={`flex w-full max-w-3xl ${compact ? 'flex-row items-center' : 'flex-col'} gap-1 border-4 border-black bg-slate-950/85 px-2 py-1 shadow-[4px_4px_0_#000] ${myTurn ? 'outline-2 outline-amber-400' : ''}`}>
      {(view.phase === 'bidding' || view.phase === 'playing') && (
        <div className={`flex items-center gap-2 text-[9px] ${compact ? 'w-36 shrink-0 flex-col items-stretch gap-0.5' : ''}`}>
          <span className={`shrink-0 ${paused ? 'text-sky-300' : myTurn ? 'animate-pulse text-amber-300' : 'text-slate-300'}`}>
            {paused ? t('pause.short') : myTurn ? (afk ? t('afk.botPlaying') : t('yourTurn')) : t('turnOf', { name: turnName })}
          </span>
          {timer}
        </div>
      )}
      <div className="flex min-h-8 flex-1 flex-wrap items-center justify-center gap-1">{body}</div>
    </div>
  );
}

function Waiting({ text, mobile = false }: { text: string; mobile?: boolean }) {
  return <span className={`text-[10px] text-slate-300 ${mobile ? 'min-w-0 leading-relaxed text-balance wrap-anywhere' : ''}`}>{text}</span>;
}

function BiddingButtons({ view, onBid, busy, compact, mobile = false }: { view: PlayerView; onBid: (b: Bid) => void; busy: boolean; compact: boolean; mobile?: boolean }) {
  const { t } = useTranslation('game');
  const isLegal = (b: Bid) => view.legalBids.some((l) => sameBid(l, b));
  const contra: Bid = { kind: 'contra' };
  const recontra: Bid = { kind: 'recontra' };
  const pass: Bid = { kind: 'pass' };
  const size = compact && !mobile ? 'sm' : 'md';
  if (mobile) {
    // 12-column grid: 4 suits (icons) · NT / AT / Pass · Contra / Recontra on their own row when legal
    // `!`: .pixel-btn is unlayered CSS, so plain utilities can't override its min-height / padding / nowrap
    const cell = 'min-h-11! w-full min-w-0 px-0.5! whitespace-normal! leading-tight text-balance wrap-anywhere';
    const extra = [contra, recontra].filter(isLegal);
    return (
      <>
        {CONTRACTS.map((c) => {
          const bid: Bid = { kind: 'contract', contract: c };
          const legal = isLegal(bid);
          const name = t(c.kind === 'suit' ? `suits.${c.suit}` : `contracts.${c.kind}`);
          return (
            <PixelButton
              key={c.kind === 'suit' ? c.suit : c.kind}
              size="md"
              variant={c.kind === 'suit' ? 'blue' : 'orange'}
              disabled={!legal || busy}
              onClick={() => onBid(bid)}
              title={name}
              aria-label={name}
              className={`${cell} ${c.kind === 'suit' ? 'col-span-3' : 'col-span-4'} ${legal ? '' : 'opacity-40'}`}
            >
              {c.kind === 'suit' ? <ContractLabel contract={c} showName={false} iconSize={20} /> : <span className="text-[9px] break-words">{name}</span>}
            </PixelButton>
          );
        })}
        <PixelButton size="md" variant="dark" disabled={!isLegal(pass) || busy} onClick={() => onBid(pass)} className={`${cell} col-span-4`}>
          {t('bids.pass')}
        </PixelButton>
        {extra.map((b) => (
          <PixelButton key={b.kind} size="md" variant="red" disabled={busy} onClick={() => onBid(b)} className={`${cell} ${extra.length > 1 ? 'col-span-6' : 'col-span-12'}`}>
            {t(`bids.${b.kind}`)}
          </PixelButton>
        ))}
      </>
    );
  }
  return (
    <>
      {CONTRACTS.map((c) => {
        const bid: Bid = { kind: 'contract', contract: c };
        const legal = isLegal(bid);
        return (
          <PixelButton
            key={c.kind === 'suit' ? c.suit : c.kind}
            size={size}
            variant={c.kind === 'suit' ? 'blue' : 'orange'}
            disabled={!legal || busy}
            onClick={() => onBid(bid)}
            title={t(c.kind === 'suit' ? `suits.${c.suit}` : `contracts.${c.kind}`)}
            className={legal ? '' : 'opacity-40'}
          >
            {c.kind === 'suit' && compact ? <BidLabelIconOnly bid={bid} /> : <BidLabel bid={bid} />}
          </PixelButton>
        );
      })}
      {isLegal(contra) && (
        <PixelButton size={size} variant="red" disabled={busy} onClick={() => onBid(contra)}>
          {t('bids.contra')}
        </PixelButton>
      )}
      {isLegal(recontra) && (
        <PixelButton size={size} variant="red" disabled={busy} onClick={() => onBid(recontra)}>
          {t('bids.recontra')}
        </PixelButton>
      )}
      <PixelButton size={size} variant="dark" disabled={!isLegal(pass) || busy} onClick={() => onBid(pass)}>
        {t('bids.pass')}
      </PixelButton>
    </>
  );
}

function BidLabelIconOnly({ bid }: { bid: Bid }) {
  if (bid.kind !== 'contract' || bid.contract.kind !== 'suit') return <BidLabel bid={bid} />;
  return <ContractLabel contract={bid.contract} showName={false} iconSize={16} />;
}

function PlayingButtons({ view, controls, mobile = false }: { view: PlayerView; controls: PlayControls; mobile?: boolean }) {
  const { t } = useTranslation('game');
  const [annOpen, setAnnOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const { selected, belot, setBelot, chosen, setChosen, play, claim, busy } = controls;
  const manual = view.settings.manualAnnounceOnly;
  const belotEligible = manual && !!selected && !!view.contract && canDeclareBelot(view.hand, selected, view.contract, view.currentTrick);
  const canAnnounce = manual && view.availableAnnouncements.length > 0;
  // mobile: bigger (≥44px) buttons that share the row (and wrap onto a second row rather than overflow)
  const size = mobile ? 'md' : 'sm';
  const btn = mobile ? 'min-h-11! flex-1 basis-0 min-w-fit' : '';
  const dialogBtn = mobile ? 'min-h-11! min-w-fit flex-1 whitespace-normal! leading-tight' : '';
  // with buttons beside it the phone gets the short prompt; alone it has the full width for the whole hint
  const hasButtons = canAnnounce || belotEligible || view.canClaim;

  return (
    <>
      {!selected && (
        <span className={`text-[10px] text-amber-200 ${mobile ? 'min-w-min flex-[1.2] basis-0 leading-relaxed text-balance' : ''}`}>
          {mobile && hasButtons ? t('mobile.selectCard') : t('selectCard')}
        </span>
      )}
      {canAnnounce && (
        <PixelButton size={size} variant="orange" onClick={() => setAnnOpen(true)} className={btn}>
          <Megaphone size={12} className="inline" /> {t('announce')}
          {chosen.length > 0 && <span className="ml-1 bg-black px-1 text-amber-300">{chosen.length}</span>}
        </PixelButton>
      )}
      {belotEligible && (
        <PixelButton size={size} variant={belot ? 'green' : 'dark'} aria-pressed={belot} onClick={() => setBelot(!belot)} className={btn}>
          <Sparkles size={12} className="inline" /> {t('announcements.belot')} {belot ? '✓' : ''}
        </PixelButton>
      )}
      {selected && (
        <PixelButton size={size} variant="green" disabled={busy} onClick={play} className={btn} data-testid="play-button">
          <Hand size={12} className="inline" /> {t('playCard')}
        </PixelButton>
      )}
      {view.canClaim && (
        <PixelButton size={size} variant="orange" disabled={busy} onClick={() => setClaimOpen(true)} title={t('claim.buttonTitle')} data-testid="claim-button" className={btn}>
          <Trophy size={12} className="inline" /> {t('claim.button')}
        </PixelButton>
      )}

      <PixelModal open={claimOpen} onClose={() => setClaimOpen(false)} title={t('claim.confirmTitle')} size="sm">
        <div className="flex flex-col gap-3 text-[10px]" data-testid="claim-confirm">
          <p className="leading-relaxed">{t('claim.confirmText')}</p>
          <p className="flex items-start gap-2 leading-relaxed text-sky-200">
            <Eye size={14} className="mt-0.5 shrink-0" /> {t('claim.confirmReveal')}
          </p>
          <p className="flex items-start gap-2 border-2 border-black bg-red-950/80 p-2 leading-relaxed text-red-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {t('claim.confirmPenalty')}
          </p>
          <div className={`flex gap-2 ${mobile ? 'flex-wrap' : ''}`}>
            <PixelButton
              variant="orange"
              disabled={busy}
              className={dialogBtn}
              data-testid="claim-confirm-button"
              onClick={() => {
                setClaimOpen(false);
                claim();
              }}
            >
              <Trophy size={12} className="inline" /> {t('claim.confirm')}
            </PixelButton>
            <PixelButton variant="dark" onClick={() => setClaimOpen(false)} className={dialogBtn}>
              {t('cancel')}
            </PixelButton>
          </div>
        </div>
      </PixelModal>

      <PixelModal open={annOpen} onClose={() => setAnnOpen(false)} title={t('announceTitle')}>
        <div className="flex flex-col gap-3">
          <p className="text-[10px] leading-relaxed">{t('announceHelp')}</p>
          {view.availableAnnouncements.map((a, i) => {
            const on = chosen.some((x) => annKey(x) === annKey(a));
            // overlapping combinations (sharing a card) can't both be declared
            const blocked = !on && chosen.some((x) => annOverlaps(x, a));
            return (
              <div key={i} className={blocked ? 'pointer-events-none opacity-40' : ''} aria-disabled={blocked}>
                <PixelToggle
                  checked={on}
                  onChange={(v) => !blocked && setChosen(v ? [...chosen, a] : chosen.filter((x) => annKey(x) !== annKey(a)))}
                  label={<AnnouncementLabel a={a} wrap={mobile} />}
                  className={mobile ? 'min-h-11' : ''}
                />
              </div>
            );
          })}
          <PixelButton variant="green" onClick={() => setAnnOpen(false)} className={mobile ? 'min-h-11!' : ''}>
            {t('done')}
          </PixelButton>
        </div>
      </PixelModal>
    </>
  );
}
