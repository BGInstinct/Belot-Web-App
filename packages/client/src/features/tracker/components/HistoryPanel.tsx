import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react';
import { PixelButton, PixelPanel } from '@/components/ui';
import { useTrackerStore } from '../store';

export function HistoryPanel() {
  const { t, i18n } = useTranslation('tracker');
  const history = useTrackerStore((s) => s.history);
  const clearHistory = useTrackerStore((s) => s.clearHistory);
  if (history.length === 0) return null;
  return (
    <PixelPanel title={t('history.title')} className="w-full">
      <ul className="flex flex-col gap-2">
        {history.map((m) => (
          <li key={m.id} className="border-2 border-black/60 bg-black/25 p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              {[0, 1].map((i) => (
                <span key={i} className={`flex min-w-0 items-center gap-1 ${m.winner === i ? 'text-amber-300' : 'text-white/70'}`}>
                  {m.winner === i && <Crown size={12} aria-hidden />}
                  <span className="truncate">{m.teamNames[i]}</span>
                  <span className="tabular-nums">{m.totals[i]}</span>
                </span>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-white/50">
              <span>{new Date(m.finishedAt).toLocaleString(i18n.language)}</span>
              <span>{t('history.rounds', { count: m.rounds })}</span>
            </div>
          </li>
        ))}
      </ul>
      <PixelButton type="button" variant="dark" size="sm" className="mt-3 min-h-11 w-full" onClick={clearHistory}>
        {t('history.clear')}
      </PixelButton>
    </PixelPanel>
  );
}
