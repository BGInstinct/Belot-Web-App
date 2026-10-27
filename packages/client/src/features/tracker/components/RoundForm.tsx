import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus, X } from 'lucide-react';
import type { Contract, Multiplier, Suit, Team } from '@belot/engine';
import { PixelButton, PixelPanel, PixelToggle } from '@/components/ui';
import { SuitIcon } from '@/components/cards';
import { CHIP_POINTS, CHIPS } from '../types';
import type { AnnouncementChip, FullRound, RoundDraft, TrackerRound } from '../types';
import { announcementsAllowed, maxBelots, modeTotal, scoreFullRound, sumChips, validateFullRound } from '../scoring';
import { FieldLabel, Segmented } from './Segmented';
import { OutcomeBadge } from './OutcomeBadge';

export type ContractKey = Suit | 'NT' | 'AT';
export const CONTRACT_KEYS: ContractKey[] = ['C', 'D', 'H', 'S', 'NT', 'AT'];

export function contractToKey(c: Contract): ContractKey {
  return c.kind === 'suit' ? c.suit : c.kind;
}
export function keyToContract(k: ContractKey): Contract {
  return k === 'NT' || k === 'AT' ? { kind: k } : { kind: 'suit', suit: k };
}

export function ContractSymbol({ k, className = '', scale = 2 }: { k: ContractKey; className?: string; scale?: number }) {
  const { t } = useTranslation('tracker');
  if (k !== 'NT' && k !== 'AT') return <SuitIcon suit={k} skinId="default" scale={scale} title={t(`contracts.${k}`)} />;
  return <span className={className}>{t(`contractsShort.${k}`)}</span>;
}

type Tab = 'full' | 'quick' | 'allPass';

const parseIntStrict = (s: string): number | null => (/^\d{1,4}$/.test(s.trim()) ? Number(s.trim()) : null);

interface FullFormState {
  contract: ContractKey;
  declarerTeam: Team;
  multiplier: Multiplier;
  inputTeam: Team;
  cardPoints: string;
  lastTenTeam: Team;
  capoTeam: Team | null;
  announcements: [AnnouncementChip[], AnnouncementChip[]];
  belots: [number, number];
}

const emptyFull = (): FullFormState => ({
  contract: 'S',
  declarerTeam: 0,
  multiplier: 1,
  inputTeam: 0,
  cardPoints: '',
  lastTenTeam: 0,
  capoTeam: null,
  announcements: [[], []],
  belots: [0, 0],
});

function fullFromRound(r: FullRound): FullFormState {
  const typed = r.trickPoints[0] - (r.lastTenTeam === 0 ? 10 : 0);
  return {
    contract: contractToKey(r.contract),
    declarerTeam: r.declarerTeam,
    multiplier: r.multiplier,
    inputTeam: 0,
    cardPoints: r.capoTeam === null ? String(Math.max(0, typed)) : '',
    lastTenTeam: r.lastTenTeam,
    capoTeam: r.capoTeam,
    announcements: [[...r.announcements[0]], [...r.announcements[1]]],
    belots: [r.belots[0], r.belots[1]],
  };
}

/** Builds the round draft from the form, or null if the typed points are not a valid number. */
function draftFromFull(f: FullFormState): Omit<FullRound, 'id'> | null {
  const contract = keyToContract(f.contract);
  const total = modeTotal(contract);
  let trickPoints: [number, number];
  if (f.capoTeam !== null) {
    trickPoints = f.capoTeam === 0 ? [total, 0] : [0, total];
  } else {
    const typed = parseIntStrict(f.cardPoints);
    const cardsTotal = total - 10;
    if (typed === null || typed > cardsTotal) return null;
    const other = (1 - f.inputTeam) as Team;
    const pts: [number, number] = [0, 0];
    pts[f.inputTeam] = typed + (f.lastTenTeam === f.inputTeam ? 10 : 0);
    pts[other] = cardsTotal - typed + (f.lastTenTeam === other ? 10 : 0);
    trickPoints = pts;
  }
  const nt = !announcementsAllowed(contract);
  return {
    kind: 'full',
    contract,
    declarerTeam: f.declarerTeam,
    multiplier: f.multiplier,
    trickPoints,
    lastTenTeam: f.capoTeam ?? f.lastTenTeam,
    announcements: nt ? [[], []] : f.announcements,
    belots: nt ? [0, 0] : f.belots,
    capoTeam: f.capoTeam,
  };
}

export function RoundForm({
  teamNames,
  roundNumber,
  hangingBefore,
  editing,
  matchOver,
  onSubmit,
  onCancel,
  onDelete,
}: {
  teamNames: [string, string];
  roundNumber: number;
  hangingBefore: number;
  editing: TrackerRound | null;
  matchOver: boolean;
  onSubmit: (draft: RoundDraft) => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation('tracker');
  const [tab, setTab] = useState<Tab>('full');
  const [full, setFull] = useState<FullFormState>(emptyFull);
  const [quick, setQuick] = useState({ a: '', b: '', hanging: '', capo: false });

  // (Re)initialise when entering/leaving edit mode.
  useEffect(() => {
    if (!editing) {
      setFull(emptyFull());
      setQuick({ a: '', b: '', hanging: '', capo: false });
      return;
    }
    setTab(editing.kind);
    if (editing.kind === 'full') setFull(fullFromRound(editing));
    if (editing.kind === 'quick')
      setQuick({
        a: String(editing.recorded[0]),
        b: String(editing.recorded[1]),
        hanging: editing.hangingAfter ? String(editing.hangingAfter) : '',
        capo: editing.capo,
      });
  }, [editing]);

  const contract = keyToContract(full.contract);
  const total = modeTotal(contract);
  const cardsTotal = total - 10;
  const ntMode = !announcementsAllowed(contract);
  const maxB = maxBelots(contract);

  const draft = useMemo(() => draftFromFull(full), [full]);
  const errors = useMemo(() => {
    if (full.capoTeam === null && full.cardPoints.trim() === '') return [];
    if (!draft) return ['errors.pointsRange'];
    return validateFullRound(draft);
  }, [draft, full.capoTeam, full.cardPoints]);
  const ready = !!draft && errors.length === 0 && (full.capoTeam !== null || full.cardPoints.trim() !== '');
  const preview = useMemo(
    () => (draft && ready ? scoreFullRound(draft, hangingBefore) : null),
    [draft, ready, hangingBefore],
  );

  const quickA = parseIntStrict(quick.a || '0');
  const quickB = parseIntStrict(quick.b || '0');
  const quickH = parseIntStrict(quick.hanging || '0');
  const quickValid = quickA !== null && quickB !== null && quickH !== null && (quick.a !== '' || quick.b !== '');

  const patch = (p: Partial<FullFormState>) => setFull((f) => ({ ...f, ...p }));
  const team = (i: Team) => teamNames[i];
  const teamOptions = [
    { value: 0 as Team, label: <span className="truncate">{team(0)}</span> },
    { value: 1 as Team, label: <span className="truncate">{team(1)}</span> },
  ];

  const disabled = matchOver && !editing;

  const submitFull = () => {
    if (draft && ready && preview?.ok) {
      onSubmit(draft);
      if (!editing) setFull((f) => ({ ...emptyFull(), contract: f.contract }));
    }
  };
  const submitQuick = () => {
    if (!quickValid) return;
    onSubmit({ kind: 'quick', recorded: [quickA!, quickB!], hangingAfter: quickH!, capo: quick.capo });
    if (!editing) setQuick({ a: '', b: '', hanging: '', capo: false });
  };

  const typedOther = (() => {
    const v = parseIntStrict(full.cardPoints);
    return v === null || v > cardsTotal ? '—' : String(cardsTotal - v);
  })();

  return (
    <PixelPanel
      id="tracker-round-form"
      title={editing ? t('form.editTitle', { n: roundNumber }) : t('form.addTitle', { n: roundNumber })}
      className="w-full"
    >
      {disabled ? (
        <p className="py-4 text-center text-sm leading-relaxed text-amber-200">{t('form.matchOver')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {!editing && (
            <Segmented<Tab>
              ariaLabel="mode"
              size="sm"
              activeVariant="blue"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'full', label: t('tabs.full') },
                { value: 'quick', label: t('tabs.quick') },
                { value: 'allPass', label: t('tabs.allPass') },
              ]}
            />
          )}

          {tab === 'full' && (
            <>
              <div>
                <FieldLabel>{t('form.contract')}</FieldLabel>
                <Segmented<ContractKey>
                  ariaLabel={t('form.contract')}
                  value={full.contract}
                  onChange={(k) => {
                    const nt = k === 'NT';
                    patch({
                      contract: k,
                      ...(nt ? { announcements: [[], []], belots: [0, 0] } : {}),
                      ...(k !== 'AT' && full.belots[0] + full.belots[1] > 1 ? { belots: [0, 0] } : {}),
                    });
                  }}
                  className="grid grid-cols-6"
                  options={CONTRACT_KEYS.map((k) => ({
                    value: k,
                    title: t(`contracts.${k}`),
                    label: <ContractSymbol k={k} scale={3} className="text-[10px]" />,
                  }))}
                />
                <div className="mt-1 text-center text-xs text-white/70">{t(`contracts.${full.contract}`)}</div>
              </div>

              <div>
                <FieldLabel>{t('form.declarer')}</FieldLabel>
                <Segmented<Team> value={full.declarerTeam} onChange={(v) => patch({ declarerTeam: v })} options={teamOptions} />
              </div>

              <div>
                <FieldLabel>{t('form.multiplier')}</FieldLabel>
                <Segmented<Multiplier>
                  size="sm"
                  activeVariant="orange"
                  value={full.multiplier}
                  onChange={(v) => patch({ multiplier: v })}
                  options={[
                    { value: 1, label: t('form.normal') },
                    { value: 2, label: t('form.contra') },
                    { value: 4, label: t('form.recontra') },
                  ]}
                />
              </div>

              <div>
                <FieldLabel>{t('form.capo')}</FieldLabel>
                <Segmented<Team | null>
                  size="sm"
                  activeVariant="orange"
                  value={full.capoTeam}
                  onChange={(v) => patch({ capoTeam: v })}
                  options={[
                    { value: null, label: t('form.capoNone') },
                    { value: 0, label: <span className="truncate">{team(0)}</span> },
                    { value: 1, label: <span className="truncate">{team(1)}</span> },
                  ]}
                />
              </div>

              {full.capoTeam === null && (
                <div>
                  <FieldLabel>{t('form.trickPoints')}</FieldLabel>
                  <p className="mb-2 text-[11px] leading-relaxed text-white/60">{t('form.trickHint', { total: cardsTotal })}</p>
                  <div className="grid grid-cols-2 gap-3">
                    {([0, 1] as Team[]).map((ti) => {
                      const isInput = full.inputTeam === ti;
                      return (
                        <div key={ti} className="flex min-w-0 flex-col gap-1">
                          <div className="truncate text-xs text-white/80">{team(ti)}</div>
                          {isInput ? (
                            <input
                              aria-label={`${t('form.pointsFor')} ${team(ti)}`}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              autoComplete="off"
                              value={full.cardPoints}
                              onChange={(e) => patch({ cardPoints: e.target.value.replace(/[^\d]/g, '').slice(0, 4) })}
                              placeholder="0"
                              className="h-14 w-full border-4 border-black bg-amber-50 px-3 text-center text-2xl text-black outline-none focus:border-amber-400"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => patch({ inputTeam: ti, cardPoints: typedOther === '—' ? '' : typedOther })}
                              className="h-14 w-full border-4 border-dashed border-white/30 bg-black/30 text-center text-2xl text-white/70"
                              title={t('form.otherTeamAuto', { team: team(ti) })}
                            >
                              {typedOther}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3">
                    <FieldLabel>{t('form.lastTen')}</FieldLabel>
                    <Segmented<Team>
                      size="sm"
                      value={full.lastTenTeam}
                      onChange={(v) => patch({ lastTenTeam: v })}
                      options={teamOptions.map((o) => ({ ...o, label: <span className="truncate">+10 {team(o.value)}</span> }))}
                    />
                  </div>
                </div>
              )}

              <div>
                <FieldLabel>{t('form.announcements')}</FieldLabel>
                {ntMode ? (
                  <p className="text-xs text-white/60">{t('form.noAnnouncementsNT')}</p>
                ) : (
                  <>
                    <p className="mb-2 text-[11px] leading-relaxed text-white/60">{t('form.announcementsHint')}</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {([0, 1] as Team[]).map((ti) => (
                        <TeamAnnouncements
                          key={ti}
                          name={team(ti)}
                          chips={full.announcements[ti]}
                          belots={full.belots[ti]}
                          canAddBelot={full.belots[0] + full.belots[1] < maxB}
                          onChips={(chips) => {
                            const a: [AnnouncementChip[], AnnouncementChip[]] = [...full.announcements];
                            a[ti] = chips;
                            patch({ announcements: a });
                          }}
                          onBelots={(n) => {
                            const b: [number, number] = [...full.belots];
                            b[ti] = n;
                            patch({ belots: b });
                          }}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>

              {errors.length > 0 && (
                <ul className="border-4 border-red-900 bg-red-950/70 p-2 text-xs leading-relaxed text-red-200">
                  {errors.map((e) => (
                    <li key={e}>{t(e)}</li>
                  ))}
                </ul>
              )}

              {ready && draft && <Preview teamNames={teamNames} draft={draft} preview={preview} />}

              <FormActions
                canSubmit={ready && !!preview?.ok}
                editing={!!editing}
                onSubmit={submitFull}
                onCancel={onCancel}
                onDelete={onDelete}
              />
            </>
          )}

          {tab === 'quick' && (
            <>
              <p className="text-[11px] leading-relaxed text-white/60">{t('form.quickHint')}</p>
              <div className="grid grid-cols-2 gap-3">
                {(['a', 'b'] as const).map((k, ti) => (
                  <label key={k} className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-xs text-white/80">{team(ti as Team)}</span>
                    <input
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      value={quick[k]}
                      placeholder="0"
                      onChange={(e) => setQuick((q) => ({ ...q, [k]: e.target.value.replace(/[^\d]/g, '').slice(0, 4) }))}
                      className="h-14 w-full border-4 border-black bg-amber-50 px-3 text-center text-2xl text-black outline-none focus:border-amber-400"
                    />
                  </label>
                ))}
              </div>
              <label className="flex items-center justify-between gap-3">
                <span className="text-xs text-white/80">{t('form.quickHanging')}</span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={quick.hanging}
                  placeholder="0"
                  onChange={(e) => setQuick((q) => ({ ...q, hanging: e.target.value.replace(/[^\d]/g, '').slice(0, 4) }))}
                  className="h-12 w-24 border-4 border-black bg-amber-50 px-2 text-center text-xl text-black outline-none focus:border-amber-400"
                />
              </label>
              <PixelToggle checked={quick.capo} onChange={(v) => setQuick((q) => ({ ...q, capo: v }))} label={t('form.quickCapo')} />
              {!quickValid && (quick.a !== '' || quick.b !== '') && <p className="text-xs text-red-300">{t('errors.quickRange')}</p>}
              <FormActions canSubmit={quickValid} editing={!!editing} onSubmit={submitQuick} onCancel={onCancel} onDelete={onDelete} />
            </>
          )}

          {tab === 'allPass' && (
            <>
              <p className="text-xs leading-relaxed text-white/80">{t('form.allPassHint')}</p>
              {editing ? (
                <FormActions canSubmit editing onSubmit={() => onSubmit({ kind: 'allPass' })} onCancel={onCancel} onDelete={onDelete} />
              ) : (
                <PixelButton type="button" variant="orange" size="lg" className="min-h-14 w-full" onClick={() => onSubmit({ kind: 'allPass' })}>
                  {t('form.recordAllPass')}
                </PixelButton>
              )}
            </>
          )}
        </div>
      )}
    </PixelPanel>
  );
}

function TeamAnnouncements({
  name,
  chips,
  belots,
  canAddBelot,
  onChips,
  onBelots,
}: {
  name: string;
  chips: AnnouncementChip[];
  belots: number;
  canAddBelot: boolean;
  onChips: (c: AnnouncementChip[]) => void;
  onBelots: (n: number) => void;
}) {
  const { t } = useTranslation('tracker');
  const sum = sumChips(chips) + belots * 20;
  return (
    <div className="border-4 border-black/60 bg-black/25 p-2">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-white/90">{name}</span>
        <span className="shrink-0 text-amber-300">+{sum}</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-3">
        {CHIPS.map((c) => (
          <PixelButton
            key={c}
            type="button"
            size="sm"
            variant="blue"
            className="min-h-11 whitespace-normal px-1 text-[10px] leading-tight"
            onClick={() => onChips([...chips, c])}
          >
            {t(`chips.${c}`)}
            <span className="block text-[9px] opacity-80">{CHIP_POINTS[c]}</span>
          </PixelButton>
        ))}
      </div>
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((c, i) => (
            <button
              key={`${c}-${i}`}
              type="button"
              onClick={() => onChips(chips.filter((_, j) => j !== i))}
              className="flex min-h-9 items-center gap-1 border-2 border-black bg-amber-200 px-2 text-[10px] text-black"
            >
              {t(`chips.${c}`)} {CHIP_POINTS[c]} <X size={12} aria-hidden />
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-white/80">
          {t('form.belot')} <span className="text-white/50">×20</span>
        </span>
        <div className="flex items-center gap-2">
          <PixelButton type="button" size="sm" variant="dark" className="min-h-10 min-w-10" disabled={belots <= 0} onClick={() => onBelots(belots - 1)} aria-label="-">
            <Minus size={14} />
          </PixelButton>
          <span className="w-5 text-center text-lg">{belots}</span>
          <PixelButton type="button" size="sm" variant="dark" className="min-h-10 min-w-10" disabled={!canAddBelot} onClick={() => onBelots(belots + 1)} aria-label="+">
            <Plus size={14} />
          </PixelButton>
        </div>
      </div>
    </div>
  );
}

function Preview({
  teamNames,
  draft,
  preview,
}: {
  teamNames: [string, string];
  draft: Omit<FullRound, 'id'>;
  preview: ReturnType<typeof scoreFullRound> | null;
}) {
  const { t } = useTranslation('tracker');
  return (
    <div className="border-4 border-amber-700 bg-black/40 p-3" aria-live="polite">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-amber-200">{t('form.preview')}</span>
        {preview?.ok && <OutcomeBadge outcome={preview.result.outcome} />}
      </div>
      <div className="text-[10px] text-white/50">{t('form.rawTotal', { a: draft.trickPoints[0], b: draft.trickPoints[1] })}</div>
      {preview && !preview.ok && <p className="mt-2 text-xs text-red-300">{t('form.engineUnavailable', { error: preview.error })}</p>}
      {preview?.ok && (
        <>
          <div className="mt-2 grid grid-cols-2 gap-3 text-center">
            {[0, 1].map((i) => (
              <div key={i} className="min-w-0">
                <div className="truncate text-xs text-white/70">{teamNames[i]}</div>
                <div className="text-3xl text-amber-300">+{preview.result.recorded[i]}</div>
              </div>
            ))}
          </div>
          {preview.result.hangingAfter > 0 && (
            <div className="mt-2 text-center text-xs text-orange-300">{t('hanging', { points: preview.result.hangingAfter })}</div>
          )}
        </>
      )}
    </div>
  );
}

function FormActions({
  canSubmit,
  editing,
  onSubmit,
  onCancel,
  onDelete,
}: {
  canSubmit: boolean;
  editing: boolean;
  onSubmit: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation('tracker');
  return (
    <div className="flex flex-col gap-2">
      <PixelButton type="button" variant="green" size="lg" className="min-h-14 w-full" disabled={!canSubmit} onClick={onSubmit}>
        {editing ? t('form.save') : t('form.confirm')}
      </PixelButton>
      {editing && (
        <div className="grid grid-cols-2 gap-2">
          <PixelButton type="button" variant="dark" className="min-h-12" onClick={onCancel}>
            {t('form.cancel')}
          </PixelButton>
          <PixelButton type="button" variant="red" className="min-h-12" onClick={onDelete}>
            {t('form.delete')}
          </PixelButton>
        </div>
      )}
    </div>
  );
}
