import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Check, Crown, Pencil } from 'lucide-react';
import type { Team } from '@belot/engine';
import { PixelPanel, PixelProgressBar } from '@/components/ui';
import { MATCH_TARGET } from '../types';
import { useTrackerStore } from '../store';

export function Scoreboard({
  teamNames,
  totals,
  hanging,
  winner,
  hangingBlocksFinish = false,
}: {
  teamNames: [string, string];
  totals: [number, number];
  hanging: number;
  winner: Team | null;
  /** a team is past the target but the last round left points hanging → the match goes on */
  hangingBlocksFinish?: boolean;
}) {
  const { t } = useTranslation('tracker');
  const rawNames = useTrackerStore((s) => s.teamNames);
  const setTeamName = useTrackerStore((s) => s.setTeamName);
  const [editing, setEditing] = useState(false);

  return (
    <PixelPanel className="w-full">
      <div className="grid grid-cols-2 gap-3">
        {([0, 1] as Team[]).map((i) => {
          const lead = totals[i] > totals[1 - i];
          return (
            <div
              key={i}
              className={`relative flex min-w-0 flex-col items-center gap-1 border-4 p-2 ${
                winner === i ? 'border-amber-400 bg-amber-900/40' : 'border-black/60 bg-black/30'
              }`}
            >
              {winner === i && <Crown className="absolute -top-4 text-amber-400" size={24} aria-hidden />}
              {editing ? (
                <input
                  aria-label={t('teamNamePlaceholder')}
                  value={rawNames[i]}
                  placeholder={i === 0 ? t('defaultTeamA') : t('defaultTeamB')}
                  onChange={(e) => setTeamName(i, e.target.value)}
                  className="h-10 w-full border-2 border-black bg-amber-50 px-2 text-center text-sm text-black outline-none"
                />
              ) : (
                <div className="w-full truncate text-center text-sm text-white/90">{teamNames[i]}</div>
              )}
              <motion.div
                key={totals[i]}
                initial={{ scale: 1.35, color: '#fde68a' }}
                animate={{ scale: 1, color: lead ? '#fcd34d' : '#ffffff' }}
                transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                className="text-5xl leading-tight tabular-nums"
              >
                {totals[i]}
              </motion.div>
              <PixelProgressBar value={Math.min(1, totals[i] / MATCH_TARGET)} color={i === 0 ? 'green' : 'blue'} className="w-full" />
              <div className="text-[10px] text-white/60">
                {totals[i] >= MATCH_TARGET ? `${MATCH_TARGET}+` : t('toWin', { points: MATCH_TARGET - totals[i] })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        <span className="text-white/70">{t('target', { target: MATCH_TARGET })}</span>
        {hanging > 0 && (
          <motion.span
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ repeat: Infinity, duration: 1.6 }}
            className="border-2 border-black bg-orange-600 px-2 py-1 text-orange-50"
          >
            {t('hanging', { points: hanging })}
          </motion.span>
        )}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="flex min-h-11 min-w-11 items-center justify-center gap-1 text-white/80 hover:text-white"
          aria-label={t('editNames')}
          title={t('editNames')}
        >
          {editing ? <Check size={18} /> : <Pencil size={18} />}
        </button>
      </div>
      {hangingBlocksFinish && winner === null && (
        <p role="status" data-testid="hanging-blocks-finish" className="mt-2 border-2 border-black bg-orange-900/70 px-2 py-1.5 text-center text-[11px] leading-relaxed text-orange-100">
          {t('hangingBlocksFinish')}
        </p>
      )}
    </PixelPanel>
  );
}
