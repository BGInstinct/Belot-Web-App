import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { PixelButton, PixelModal, PixelScreen } from '@/components/ui';
import { computeSheet } from './scoring';
import { useTrackerStore } from './store';
import { useTeamNames } from './useTeamNames';
import type { RoundDraft } from './types';
import { Scoreboard } from './components/Scoreboard';
import { RoundForm } from './components/RoundForm';
import { ScoreSheet } from './components/ScoreSheet';
import { WinnerCelebration } from './components/WinnerCelebration';
import { HistoryPanel } from './components/HistoryPanel';

export default function TrackerPage() {
  const { t } = useTranslation('tracker');
  const rounds = useTrackerStore((s) => s.rounds);
  const addRound = useTrackerStore((s) => s.addRound);
  const updateRound = useTrackerStore((s) => s.updateRound);
  const deleteRound = useTrackerStore((s) => s.deleteRound);
  const undoLastRound = useTrackerStore((s) => s.undoLastRound);
  const newMatch = useTrackerStore((s) => s.newMatch);
  const celebratedMatchKey = useTrackerStore((s) => s.celebratedMatchKey);
  const setCelebrated = useTrackerStore((s) => s.setCelebrated);
  const teamNames = useTeamNames();

  const sheet = useMemo(() => computeSheet(rounds), [rounds]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmNew, setConfirmNew] = useState(false);

  const editingRow = editingId ? sheet.rows.find((r) => r.round.id === editingId) ?? null : null;
  const winKey = sheet.winnerRoundIndex !== null ? rounds[sheet.winnerRoundIndex]?.id ?? null : null;
  const showCelebration = winKey !== null && celebratedMatchKey !== winKey && !editingRow;

  const startEdit = (id: string) => {
    setEditingId((cur) => (cur === id ? null : id));
    requestAnimationFrame(() =>
      document.getElementById('tracker-round-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const handleSubmit = (draft: RoundDraft) => {
    if (editingRow) {
      updateRound(editingRow.round.id, draft);
      setEditingId(null);
    } else {
      addRound(draft);
    }
  };

  const startNewMatch = () => {
    newMatch(teamNames);
    setEditingId(null);
    setConfirmNew(false);
  };

  return (
    <PixelScreen title={t('title')} back="/">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 pb-24 pt-3 text-white sm:px-4">
        <header className="flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-white/70">{t('subtitle')}</p>
          <PixelButton
            type="button"
            variant="red"
            size="sm"
            className="flex min-h-11 shrink-0 items-center gap-1"
            onClick={() => (rounds.length ? setConfirmNew(true) : startNewMatch())}
            icon={<RotateCcw size={16} />}
          >
            {t('newMatch')}
          </PixelButton>
        </header>

        <Scoreboard teamNames={teamNames} totals={sheet.totals} hanging={sheet.hanging} winner={sheet.winner} hangingBlocksFinish={sheet.hangingBlocksFinish} />

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <RoundForm
            teamNames={teamNames}
            roundNumber={editingRow ? editingRow.index + 1 : rounds.length + 1}
            hangingBefore={editingRow ? editingRow.hangingBefore : sheet.hanging}
            editing={editingRow?.round ?? null}
            matchOver={sheet.winner !== null}
            onSubmit={handleSubmit}
            onCancel={() => setEditingId(null)}
            onDelete={() => {
              if (editingRow) deleteRound(editingRow.round.id);
              setEditingId(null);
            }}
          />
          <div className="flex flex-col gap-4">
            <ScoreSheet
              teamNames={teamNames}
              sheet={sheet}
              editingId={editingId}
              onEdit={startEdit}
              onUndo={() => {
                undoLastRound();
                setEditingId(null);
              }}
            />
            <HistoryPanel />
          </div>
        </div>
      </div>

      <PixelModal open={confirmNew} onClose={() => setConfirmNew(false)} title={t('newMatch')}>
        <p className="mb-4 text-sm leading-relaxed">{t('newMatchConfirm')}</p>
        <div className="grid grid-cols-2 gap-2">
          <PixelButton type="button" variant="dark" className="min-h-12" onClick={() => setConfirmNew(false)}>
            {t('form.cancel')}
          </PixelButton>
          <PixelButton type="button" variant="red" className="min-h-12" onClick={startNewMatch}>
            {t('confirmYes')}
          </PixelButton>
        </div>
      </PixelModal>

      <WinnerCelebration
        open={showCelebration}
        winnerName={sheet.winner !== null ? teamNames[sheet.winner] : ''}
        totals={sheet.totals}
        onClose={() => setCelebrated(winKey)}
        onNewMatch={startNewMatch}
      />
    </PixelScreen>
  );
}
