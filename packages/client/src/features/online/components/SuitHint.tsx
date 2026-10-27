/** Suit-equivalence hint in a table corner (foundation SuitHintBadge; renders nothing for classic skins). */
import { SuitHintBadge } from '@/components/cards';

export default function SuitHint({ compact = false }: { compact?: boolean }) {
  return <SuitHintBadge defaultCollapsed={compact} scale={compact ? 1 : 2} />;
}
