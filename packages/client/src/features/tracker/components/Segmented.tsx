import type { ReactNode } from 'react';
import { PixelButton } from '@/components/ui';
import type { PixelButtonVariant } from '@/components/ui';

export interface SegmentOption<T> {
  value: T;
  label: ReactNode;
  title?: string;
}

/** A row of pixel buttons acting as a radio group. */
export function Segmented<T extends string | number | null>({
  options,
  value,
  onChange,
  activeVariant = 'green',
  size = 'md',
  className = '',
  ariaLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  activeVariant?: PixelButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`flex flex-wrap gap-2 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <PixelButton
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            size={size}
            variant={active ? activeVariant : 'dark'}
            className={`min-h-12 min-w-12 flex-1 whitespace-normal leading-tight ${active ? '' : 'opacity-80'}`}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </PixelButton>
        );
      })}
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 text-[11px] uppercase tracking-wider text-amber-200/90">{children}</div>;
}
