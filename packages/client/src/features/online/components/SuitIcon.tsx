import type { Suit } from '@belot/engine';
import { SuitIcon as SkinSuitIcon } from '@/components/cards';
import { SUIT_SYMBOL, isRedSuit } from '../util';

/**
 * Suit pip. With `src` (the equipped skin has pixel suit icons) it renders the foundation SkinSuitIcon
 * at an integer scale; otherwise the classic glyph.
 */
export default function SuitIcon({ suit, size = 16, src, className = '', onDark = true }: { suit: Suit; size?: number; src?: string; className?: string; onDark?: boolean }) {
  if (src) return <SkinSuitIcon suit={suit} scale={Math.max(1, Math.round(size / 9))} className={className} />;
  return (
    <span
      aria-label={suit}
      className={`inline-block align-middle leading-none ${isRedSuit(suit) ? 'text-red-500' : onDark ? 'text-slate-100' : 'text-slate-900'} ${className}`}
      style={{ fontSize: size, fontFamily: 'system-ui, sans-serif', textShadow: onDark ? '1px 1px 0 #000' : 'none' }}
    >
      {SUIT_SYMBOL[suit]}
    </span>
  );
}
