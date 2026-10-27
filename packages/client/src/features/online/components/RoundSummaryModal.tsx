import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Bot, Check, Hourglass, Loader2, Pause, X } from 'lucide-react';
import { cardId, type PlayerView, type RoomView, type RoundResult, type Seat } from '@belot/engine';
import PlayingCard from '@/components/cards/PlayingCard';
import { PixelButton, PixelModal, PixelProgressBar } from '@/components/ui';
import { ContractLabel } from './Labels';
import { useOnline } from '../store';
import { SEATS, seatName, sortHand, teamOf, useNow } from '../util';

const OUTCOME_COLOR: Record<string, string> = {
  made: 'bg-emerald-600',
  failed: 'bg-red-700',
  hanging: 'bg-orange-500',
  allPass: 'bg-slate-600',
};

const READY_TOTAL_MS = 60_000;

/**
 * Round summary from the `roundEnded` event. Stays open for the whole round-end ready-up phase
 * (`room.roundReady`): Continue sends `game:ready`; it closes when the next round is dealt (the store
 * clears `roundResult`). After the final round (no ready-up) Continue just closes it to reveal the match-end overlay.
 */
export default function RoundSummaryModal({
  result,
  view,
  room,
  mySeat,
  onClose,
  sheet = false,
}: {
  result: RoundResult | null;
  view: PlayerView;
  room: RoomView;
  mySeat: Seat | null;
  onClose: () => void;
  /** portrait phone: bottom sheet with scrollable details and Continue pinned at the bottom (safe-area aware) */
  sheet?: boolean;
}) {
  // the next deal already happened (e.g. a missed state transition) → nothing to show
  if (!result || view.phase === 'bidding' || view.phase === 'playing') return null;
  return <Summary key={view.roundNumber} result={result} view={view} room={room} mySeat={mySeat} onClose={onClose} sheet={sheet} />;
}

function Summary({
  result,
  view,
  room,
  mySeat,
  onClose,
  sheet,
}: {
  result: RoundResult;
  view: PlayerView;
  room: RoomView;
  mySeat: Seat | null;
  onClose: () => void;
  sheet: boolean;
}) {
  const { t } = useTranslation('game');
  const ready = useOnline((s) => s.ready);
  const [clicked, setClicked] = useState(false);
  const [sending, setSending] = useState(false);
  const rr = room.roundReady;
  const readyPhase = rr !== null && view.phase === 'roundEnd' && room.status === 'playing';
  const now = useNow(250, readyPhase && !room.paused);

  const myTeam = mySeat === null ? null : teamOf(mySeat);
  const teams: (0 | 1)[] = myTeam === 1 ? [1, 0] : [0, 1];
  const label = (team: 0 | 1) => (myTeam === null ? t(`team${team}`) : team === myTeam ? t('us') : t('them'));
  const teamColor = (team: 0 | 1) => (team === 0 ? 'text-sky-300' : 'text-rose-300');
  const allPass = result.outcome === 'allPass';

  // belot is part of `announcementPoints`; split it out using the round's declarations
  const belot: [number, number] = [0, 0];
  for (const d of view.declared) if (d.announcement.type === 'belot') belot[teamOf(d.seat)] += d.announcement.points || 20;
  const combos: [number, number] = [0, 1].map((tm) => Math.max(0, result.announcementPoints[tm] - belot[tm])) as [number, number];

  const isReady = (s: Seat) => !!rr && (rr.readySeats.includes(s) || room.seats[s].isBot || room.afkSeats.includes(s) || !room.seats[s].connected);
  const meReady = mySeat !== null && (clicked || (readyPhase && isReady(mySeat)));
  const readyCount = SEATS.filter(isReady).length;
  // while paused the deadline is stale: the server reports the frozen remaining ready time instead
  const leftMs = !rr ? 0 : room.paused ? Math.max(0, room.pausedRemainingMs ?? 0) : Math.max(0, rr.deadline - now);
  const finalRound = view.phase === 'matchEnd' || room.status === 'finished';

  const onContinue = async () => {
    if (!readyPhase) {
      onClose();
      return;
    }
    setSending(true);
    const ok = await ready();
    setSending(false);
    if (ok) setClicked(true);
  };

  const row = (name: string, vals: [number, number], cls = '', prefix = '') => (
    <tr className={`border-t-2 border-slate-700 ${cls}`}>
      <td className="p-1">{name}</td>
      {teams.map((tm) => (
        <td key={tm} className="p-1 text-right tabular-nums">
          {prefix}
          {vals[tm]}
        </td>
      ))}
    </tr>
  );

  const content = (
    <>
        {/* contract / outcome */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {result.contract ? (
            <span className="border-2 border-black bg-slate-900 px-2 py-1 text-slate-100">
              <ContractLabel contract={result.contract} multiplier={result.multiplier} />
            </span>
          ) : null}
          {result.declarerTeam !== null && (
            <span className="text-slate-300">
              {t('summary.declarer')}: <span className={teamColor(result.declarerTeam)}>{label(result.declarerTeam)}</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <span className={`border-2 border-black px-2 py-1 text-white ${OUTCOME_COLOR[result.outcome]} ${sheet ? 'text-center leading-relaxed text-balance' : ''}`}>{t(`outcome.${result.outcome}`)}</span>
          {result.capoTeam !== null && (
            <span className="border-2 border-black bg-purple-700 px-2 py-1 text-white">{t('summary.capo', { team: label(result.capoTeam) })}</span>
          )}
        </div>
        {result.claim && (
          <div
            data-testid="summary-claim"
            className={`flex flex-col items-center gap-1 border-2 border-black px-2 py-1.5 text-center ${result.claim.success ? 'bg-emerald-950/80 text-emerald-200' : 'bg-red-950/80 text-red-200'}`}
          >
            <span className={`flex items-center justify-center gap-1 ${sheet ? 'min-w-0 leading-relaxed text-balance wrap-anywhere' : ''}`}>
              {result.claim.success ? <Check size={12} className="shrink-0" /> : <X size={12} className="shrink-0" />}
              {t(result.claim.success ? 'summary.claimSuccess' : 'summary.claimFailed', {
                name: result.claim.seat === mySeat ? t('you') : seatName(room, result.claim.seat, t('bot'), '?'),
                count: result.claim.tricksClaimed,
              })}
            </span>
            {result.claim.revealed.length > 0 && (
              <span className="flex flex-wrap justify-center gap-0.5">
                {sortHand(result.claim.revealed, result.contract).map((c) => (
                  <PlayingCard key={cardId(c)} card={c} scale={1} noHover />
                ))}
              </span>
            )}
          </div>
        )}
        {!allPass && result.declarerTeam !== null && (
          <p className={`text-center leading-relaxed text-slate-300 ${sheet ? 'text-balance' : ''}`}>{t(`summary.explain.${result.outcome}`, { team: label(result.declarerTeam) })}</p>
        )}
        {allPass && <p className={`text-center leading-relaxed text-slate-300 ${sheet ? 'text-balance' : ''}`}>{t('summary.allPassText')}</p>}

        {/* points */}
        {!allPass && (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-slate-400">
                <th className="p-1"></th>
                {teams.map((tm) => (
                  <th key={tm} className={`p-1 text-right ${teamColor(tm)}`}>
                    {label(tm)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {row(t('summary.trickPoints'), result.trickPoints)}
              {row(t('summary.announcements'), combos)}
              {row(t('announcements.belot'), belot)}
              {row(t('summary.recorded'), result.recorded, 'text-amber-300', '+')}
              {row(t('summary.matchTotal'), view.score, 'text-sm text-white')}
            </tbody>
          </table>
        )}
        {allPass && (
          <div className="flex justify-center gap-4">
            {teams.map((tm) => (
              <span key={tm}>
                <span className={teamColor(tm)}>{label(tm)}</span> <span className="text-sm text-amber-300 tabular-nums">{view.score[tm]}</span>
              </span>
            ))}
          </div>
        )}
        {result.hangingAfter > 0 && (
          <>
            <p className={`text-center text-orange-300 ${sheet ? 'leading-relaxed text-balance' : ''}`}>{t('summary.hangingAfter', { n: result.hangingAfter })}</p>
            <p className={`text-center text-[8px] leading-relaxed text-orange-200/80 ${sheet ? 'text-balance' : ''}`} data-testid="summary-hanging-note">
              {t('summary.hangingNoFinish')}
            </p>
          </>
        )}
        <p className="text-center text-[8px] text-slate-500">{t('summary.target')}</p>
    </>
  );

  const footer = (
    <>
        {/* ready-up */}
        {readyPhase && rr && (
          <div className="flex flex-col gap-2 border-t-2 border-slate-700 pt-2">
            <div className="flex items-center justify-between gap-2 text-[9px] text-slate-300">
              <span className="shrink-0">{t('summary.readyCount', { n: readyCount })}</span>
              <span className={`flex min-w-0 items-center justify-end gap-1 text-right tabular-nums ${sheet ? 'leading-relaxed text-balance' : ''}`}>
                {room.paused ? (
                  <>
                    <Pause size={10} /> {t('pause.short')} · {Math.ceil(leftMs / 1000)}s
                  </>
                ) : (
                  t('summary.nextIn', { s: Math.ceil(leftMs / 1000) })
                )}
              </span>
            </div>
            <PixelProgressBar value={Math.min(1, leftMs / READY_TOTAL_MS)} color={room.paused ? 'blue' : leftMs < 10_000 ? 'red' : 'green'} />
            <ul className="grid grid-cols-2 gap-1">
              {SEATS.map((s) => {
                const info = room.seats[s];
                const ok = isReady(s);
                const name = s === mySeat ? t('you') : seatName(room, s, t('bot'), t('emptySeat'));
                return (
                  <li
                    key={s}
                    data-ready={ok}
                    className={`flex items-center gap-1 border-2 border-black px-1.5 py-1 ${ok ? 'bg-emerald-900/70' : 'bg-slate-800'}`}
                  >
                    {ok ? <Check size={12} className="shrink-0 text-emerald-300" /> : <Hourglass size={12} className="shrink-0 animate-pulse text-amber-300" />}
                    <span className={`min-w-0 flex-1 truncate ${teamColor(teamOf(s))}`}>{name}</span>
                    {info.isBot ? (
                      <Bot size={11} className="shrink-0 text-slate-400" />
                    ) : room.afkSeats.includes(s) ? (
                      <span className="shrink-0 bg-orange-600 px-1 text-[7px] text-white">AFK</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {mySeat === null ? (
          readyPhase ? <p className="text-center text-slate-400">{t('summary.spectatorWait')}</p> : (
            <PixelButton variant="dark" onClick={onClose} className={sheet ? 'min-h-11!' : ''}>
              {t('close')}
            </PixelButton>
          )
        ) : meReady ? (
          <p className="flex items-center justify-center gap-2 border-2 border-black bg-slate-800 px-2 py-2 text-center text-emerald-200">
            <Loader2 size={14} className="shrink-0 animate-spin" /> {t('summary.waitingOthers')}
          </p>
        ) : (
          <PixelButton
            variant="green"
            size="lg"
            block
            disabled={sending}
            onClick={() => void onContinue()}
            className={sheet ? 'min-h-12! whitespace-normal! leading-tight text-balance' : ''}
            data-testid="round-continue"
          >
            {finalRound ? t('summary.seeResult') : t('continue')}
          </PixelButton>
        )}
    </>
  );

  if (sheet) {
    return (
      <SummarySheet title={t('summary.titleN', { n: view.roundNumber })} onClose={readyPhase ? undefined : onClose} footer={footer}>
        {content}
      </SummarySheet>
    );
  }

  return (
    <PixelModal open onClose={readyPhase ? () => undefined : onClose} dismissible={!readyPhase} title={t('summary.titleN', { n: view.roundNumber })}>
      <div className="flex flex-col gap-3 text-[10px]" data-testid="round-summary">
        {content}
        {footer}
      </div>
    </PixelModal>
  );
}

/** Bottom sheet (portrait phones): title, scrollable body, footer pinned above the home indicator. */
function SummarySheet({ title, onClose, footer, children }: { title: string; onClose?: () => void; footer: ReactNode; children: ReactNode }) {
  const { t } = useTranslation('common');
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div
        className="absolute inset-0 bg-ink/70"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgb(0 0 0 / 0.25) 0 2px, transparent 2px 4px)' }}
        onClick={onClose}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="round-summary"
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'tween', ease: (p: number) => Math.round(p * 5) / 5, duration: 0.2 }}
        className="pixel-panel relative flex max-h-[92dvh] min-w-0 flex-col text-[10px]"
      >
        <div className="pixel-panel-title flex items-center justify-between gap-3 px-3 py-2">
          <h2 className="text-shadow-px m-0 min-w-0 text-xs leading-snug text-balance wrap-anywhere text-gold">{title}</h2>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              className="pixel-border flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center bg-blood text-paper hover:bg-ember active:translate-y-[2px]"
            >
              <X size={16} strokeWidth={3} />
            </button>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-3 py-2">{children}</div>
        <div className="flex shrink-0 flex-col gap-2 border-t-[3px] border-ink px-3 pt-2" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          {footer}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
