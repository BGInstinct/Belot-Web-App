import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Pencil, Undo2 } from 'lucide-react';
import { PixelButton, PixelPanel } from '@/components/ui';
import type { SheetResult, SheetRow } from '../types';
import { OutcomeBadge } from './OutcomeBadge';
import { ContractSymbol, contractToKey } from './RoundForm';

function RowLabel({ row }: { row: SheetRow }) {
  const { t } = useTranslation('tracker');
  const r = row.round;
  if (r.kind === 'allPass') return <OutcomeBadge outcome="allPass" />;
  if (r.kind === 'quick')
    return (
      <span className="flex flex-wrap items-center gap-1">
        <OutcomeBadge outcome="quick" />
        {r.capo && <span className="text-[9px] text-amber-700">{t('sheet.capoMark')}</span>}
      </span>
    );
  return (
    <span className="flex flex-wrap items-center gap-1">
      <ContractSymbol k={contractToKey(r.contract)} className="text-xs leading-none" />
      {r.multiplier > 1 && (
        <span className="text-[9px] text-orange-700">{r.multiplier === 2 ? t('sheet.contraMark') : t('sheet.recontraMark')}</span>
      )}
      {r.capoTeam !== null && <span className="text-[9px] text-amber-700">{t('sheet.capoMark')}</span>}
      <OutcomeBadge outcome={row.outcome} />
    </span>
  );
}

export function ScoreSheet({
  teamNames,
  sheet,
  editingId,
  onEdit,
  onUndo,
}: {
  teamNames: [string, string];
  sheet: SheetResult;
  editingId: string | null;
  onEdit: (id: string) => void;
  onUndo: () => void;
}) {
  const { t } = useTranslation('tracker');
  return (
    <PixelPanel title={t('sheet.title')} className="w-full">
      {/* paper sheet */}
      <div className="overflow-hidden border-4 border-black bg-[#f4ecd2] text-[#1f2a44] shadow-[4px_4px_0_0_rgba(0,0,0,0.6)]">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[5.5rem]" />
            <col />
            <col />
            <col className="w-8" />
          </colgroup>
          <thead>
            <tr className="border-b-4 border-[#1f2a44]">
              <th className="p-2 text-[10px] font-normal text-[#1f2a44]/60">{t('sheet.round')}</th>
              <th className="truncate border-r-4 border-[#1f2a44] p-2 text-center font-normal">{teamNames[0]}</th>
              <th className="truncate p-2 text-center font-normal">{teamNames[1]}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sheet.rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-xs leading-relaxed text-[#1f2a44]/60">
                  {t('sheet.empty')}
                </td>
              </tr>
            )}
            <AnimatePresence initial={false}>
              {sheet.rows.map((row) => {
                const isEditing = editingId === row.round.id;
                return (
                  <motion.tr
                    key={row.round.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    onClick={() => onEdit(row.round.id)}
                    className={`cursor-pointer border-b-2 border-dashed border-[#1f2a44]/25 align-top ${
                      isEditing ? 'bg-amber-300/60' : row.afterMatchEnd ? 'opacity-40' : 'hover:bg-black/5'
                    }`}
                  >
                    <td className="p-1.5 text-[10px] leading-tight">
                      <div className="mb-1 text-[#1f2a44]/60">#{row.index + 1}</div>
                      <RowLabel row={row} />
                      {row.hangingAfter > 0 && !row.afterMatchEnd && (
                        <div className="mt-1 text-[9px] text-orange-700">
                          {row.hangingAfter} {t('hangingShort')}
                        </div>
                      )}
                      {row.afterMatchEnd && <div className="mt-1 text-[9px] text-red-700">{t('sheet.afterEnd')}</div>}
                      {row.error && <div className="mt-1 text-[9px] text-red-700">!</div>}
                    </td>
                    {[0, 1].map((i) => (
                      <td key={i} className={`p-2 text-center align-middle ${i === 0 ? 'border-r-4 border-[#1f2a44]' : ''}`}>
                        <div className={`text-xl tabular-nums ${row.recorded[i] === 0 ? 'text-[#1f2a44]/40' : ''}`}>{row.recorded[i]}</div>
                        <div className="text-[9px] tabular-nums text-[#1f2a44]/50">Σ {row.totals[i]}</div>
                      </td>
                    ))}
                    <td className="p-1 text-center">
                      <Pencil size={14} className="mx-auto mt-2 text-[#1f2a44]/50" aria-label={t('sheet.edit')} />
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
          {sheet.rows.length > 0 && (
            <tfoot>
              <tr className="border-t-4 border-double border-[#1f2a44]">
                <td className="p-2 text-[9px] text-[#1f2a44]/60">{t('sheet.total')}</td>
                <td className="border-r-4 border-[#1f2a44] p-2 text-center text-3xl tabular-nums">{sheet.totals[0]}</td>
                <td className="p-2 text-center text-3xl tabular-nums">{sheet.totals[1]}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {sheet.rows.length > 0 && (
        <PixelButton type="button" variant="orange" className="mt-3 flex min-h-12 w-full items-center justify-center gap-2" onClick={onUndo}>
          <Undo2 size={16} /> {t('sheet.undo')}
        </PixelButton>
      )}
    </PixelPanel>
  );
}
