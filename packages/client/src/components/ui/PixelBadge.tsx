import type { HTMLAttributes } from 'react';

export type PixelBadgeColor = 'gold' | 'green' | 'red' | 'blue' | 'slate';

const COLORS: Record<PixelBadgeColor, string> = {
  gold: 'bg-gold text-ink',
  green: 'bg-leaf text-ink',
  red: 'bg-blood text-paper',
  blue: 'bg-sea text-paper',
  slate: 'bg-slate text-bone',
};

/** Small pixel label / chip. */
export function PixelBadge({ color = 'gold', className = '', ...rest }: HTMLAttributes<HTMLSpanElement> & { color?: PixelBadgeColor }) {
  return (
    <span
      className={`pixel-border inline-flex items-center gap-1 px-2 py-1 text-[9px] leading-none sm:text-[10px] ${COLORS[color]} ${className}`}
      {...rest}
    />
  );
}
