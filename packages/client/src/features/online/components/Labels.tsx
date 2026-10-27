import { useTranslation } from 'react-i18next';
import type { Announcement, Bid, Contract, Multiplier } from '@belot/engine';
import SuitIcon from './SuitIcon';
import { useSuitIconSrc } from './skinAssets';

export function ContractLabel({ contract, multiplier = 1, iconSize = 14, showName = true, onDark = true }: { contract: Contract; multiplier?: Multiplier; iconSize?: number; showName?: boolean; onDark?: boolean }) {
  const { t } = useTranslation('game');
  const suitSrc = useSuitIconSrc();
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {contract.kind === 'suit' ? (
        <>
          <SuitIcon suit={contract.suit} size={iconSize} src={suitSrc(contract.suit)} onDark={onDark} />
          {showName && <span>{t(`suits.${contract.suit}`)}</span>}
        </>
      ) : (
        <span>{t(`contracts.${contract.kind}`)}</span>
      )}
      {multiplier > 1 && <span className="bg-red-700 px-1 text-white">×{multiplier}</span>}
    </span>
  );
}

export function BidLabel({ bid, iconSize = 14, onDark = true }: { bid: Bid; iconSize?: number; onDark?: boolean }) {
  const { t } = useTranslation('game');
  if (bid.kind === 'contract') return <ContractLabel contract={bid.contract} iconSize={iconSize} onDark={onDark} />;
  return <span>{t(`bids.${bid.kind}`)}</span>;
}

/** `wrap`: let the parts wrap onto a second line (narrow phone dialogs) instead of forcing one line */
export function AnnouncementLabel({ a, onDark = true, wrap = false }: { a: Announcement; onDark?: boolean; wrap?: boolean }) {
  const { t } = useTranslation('game');
  const suitSrc = useSuitIconSrc();
  return (
    <span className={`inline-flex items-center gap-1 ${wrap ? 'flex-wrap gap-y-0.5' : 'whitespace-nowrap'}`}>
      <span>{t(`announcements.${a.type}`)}</span>
      {a.type === 'carre' ? (
        <span>{t('announcements.ofRank', { rank: t(`ranks.${a.highRank}`) })}</span>
      ) : (
        a.suit && (
          <span className="inline-flex items-center gap-0.5">
            {a.type !== 'belot' && <span>{a.highRank}</span>}
            <SuitIcon suit={a.suit} size={11} src={suitSrc(a.suit)} onDark={onDark} />
          </span>
        )
      )}
      <span className={onDark ? 'text-amber-300' : 'text-red-800'}>+{a.points}</span>
    </span>
  );
}
