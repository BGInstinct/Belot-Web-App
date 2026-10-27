import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Hourglass } from 'lucide-react';
import type { PlayerView, RoomView, Seat } from '@belot/engine';
import { ContractLabel } from './Labels';
import { seatName } from '../util';

/** Team scores (target 151), contract + multiplier + declarer, hanging points, tricks taken. */
export default function Scoreboard({
  view,
  room,
  mySeat,
  compact,
  variant = 'panel',
}: {
  view: PlayerView;
  room: RoomView;
  mySeat: Seat | null;
  compact: boolean;
  /** `bar`: portrait phone top bar — team scores (+ tricks) on the left, contract / declarer / round / hanging on the right */
  variant?: 'panel' | 'bar';
}) {
  const { t } = useTranslation('game');
  const myTeam = mySeat === null ? 0 : mySeat % 2;
  const order: (0 | 1)[] = myTeam === 0 ? [0, 1] : [1, 0];
  const label = (team: 0 | 1) => (mySeat === null ? t(`team${team}`) : team === myTeam ? t('us') : t('them'));

  if (variant === 'bar') {
    const declarer =
      view.contract && view.declarer !== null ? (view.declarer === mySeat ? t('you') : seatName(room, view.declarer, t('bot'), t('emptySeat'))) : null;
    const round = <span title={t('round', { n: view.roundNumber })}>{t('mobile.roundShort', { n: view.roundNumber })}</span>;
    // `@container` queries on the info column drop / shorten the optional bits instead of clipping them
    const hanging =
      view.hanging > 0 ? (
        <span className="shrink-0 text-orange-300" title={t('hanging', { n: view.hanging })}>
          <span className="hidden @min-[68px]:inline">{t('mobile.hangingShort', { n: view.hanging })}</span>
          <span className="inline-flex items-center gap-0.5 @min-[68px]:hidden">
            <Hourglass size={8} className="shrink-0" />
            {view.hanging}
          </span>
        </span>
      ) : null;
    return (
      <div
        className="flex w-full min-w-0 items-center gap-1.5 border-4 border-black bg-slate-950/85 px-1 py-0.5 text-[8px] leading-none text-slate-100 shadow-[3px_3px_0_#000]"
        data-testid="scoreboard-bar"
      >
        <div className="grid shrink-0 grid-cols-[auto_auto_auto] items-baseline gap-x-1 gap-y-1.5 whitespace-nowrap">
          {order.map((team) => (
            <Fragment key={team}>
              <span className={team === 0 ? 'text-sky-300' : 'text-rose-300'}>{label(team)}</span>
              <span className="text-right text-[10px] text-amber-300 tabular-nums">{view.score[team]}</span>
              <span className="text-[7px] text-slate-400" title={t('tricks')}>
                {view.phase === 'playing' ? t('mobile.tricksTiny', { n: view.tricksWon[team] }) : ''}
              </span>
            </Fragment>
          ))}
        </div>
        <div className="@container flex min-w-0 flex-1 flex-col gap-1.5 self-stretch justify-center border-l-2 border-slate-700 pl-1.5 whitespace-nowrap text-slate-400">
          {view.contract ? (
            <>
              <span className="flex min-w-0 items-center gap-1">
                <span className="shrink-0 text-slate-100" title={t(view.contract.kind === 'suit' ? `suits.${view.contract.suit}` : `contracts.${view.contract.kind}`)}>
                  {view.contract.kind === 'suit' ? (
                    <ContractLabel contract={view.contract} multiplier={view.multiplier} showName={false} iconSize={10} />
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <span className="hidden @min-[112px]:inline">{t(`contracts.${view.contract.kind}`)}</span>
                      <span className="@min-[112px]:hidden">{t(`mobile.contractShort.${view.contract.kind}`)}</span>
                      {view.multiplier > 1 && <span className="bg-red-700 px-1 text-white">×{view.multiplier}</span>}
                    </span>
                  )}
                </span>
                {declarer && <span className="hidden min-w-0 truncate @min-[90px]:block">{declarer}</span>}
              </span>
              <span className="flex min-w-0 items-center gap-1.5">
                {view.hanging > 0 ? <span className="hidden @min-[92px]:inline">{round}</span> : round}
                {hanging}
              </span>
            </>
          ) : (
            <>
              {round}
              {hanging && <span className="flex">{hanging}</span>}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-1 border-4 border-black bg-slate-950/85 p-1.5 text-[9px] text-slate-100 shadow-[3px_3px_0_#000] ${compact ? 'min-w-[110px]' : 'min-w-[160px] sm:text-[10px]'}`}>
      <div className="flex items-center justify-between gap-2 text-[8px] text-slate-400">
        <span>{t('round', { n: view.roundNumber })}</span>
        <span>{t('target')}</span>
      </div>
      {order.map((team) => (
        <div key={team} className="flex items-center justify-between gap-2">
          <span className={team === 0 ? 'text-sky-300' : 'text-rose-300'}>{label(team)}</span>
          <span className="flex items-center gap-2">
            {view.phase === 'playing' && (
              <span className="text-[8px] text-slate-400" title={t('tricks')}>
                {t('tricksShort', { n: view.tricksWon[team] })}
              </span>
            )}
            <span className="text-sm text-amber-300 tabular-nums">{view.score[team]}</span>
          </span>
        </div>
      ))}
      {view.contract && (
        <div className="flex flex-wrap items-center gap-1 border-t-2 border-slate-700 pt-1">
          <ContractLabel contract={view.contract} multiplier={view.multiplier} showName={!compact} />
          {view.declarer !== null && (
            <span className="max-w-[90px] truncate text-slate-400">· {view.declarer === mySeat ? t('you') : seatName(room, view.declarer, t('bot'), t('emptySeat'))}</span>
          )}
        </div>
      )}
      {view.hanging > 0 && (
        <div className="text-[8px] text-orange-300">{t('hanging', { n: view.hanging })}</div>
      )}
    </div>
  );
}
