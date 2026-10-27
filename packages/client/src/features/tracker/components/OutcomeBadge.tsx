import { useTranslation } from 'react-i18next';
import type { RoundOutcome } from '@belot/engine';

const STYLES: Record<RoundOutcome | 'quick', string> = {
  made: 'bg-green-700 text-green-50',
  failed: 'bg-red-700 text-red-50',
  hanging: 'bg-orange-600 text-orange-50',
  allPass: 'bg-slate-600 text-slate-100',
  quick: 'bg-sky-800 text-sky-50',
};

export function OutcomeBadge({ outcome }: { outcome: RoundOutcome | 'quick' }) {
  const { t } = useTranslation('tracker');
  return (
    <span className={`inline-block border-2 border-black px-1.5 py-0.5 text-[9px] uppercase leading-none ${STYLES[outcome]}`}>
      {t(`outcome.${outcome}`)}
    </span>
  );
}
