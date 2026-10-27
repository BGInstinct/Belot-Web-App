import type { ReactNode } from 'react';

export interface PixelSegmentedOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

export interface PixelSegmentedProps<T extends string | number> {
  value: T;
  options: PixelSegmentedOption<T>[];
  onChange: (v: T) => void;
  className?: string;
  'aria-label'?: string;
}

/** Row of pixel tabs — e.g. turn timer 15s/30s/45s/60s or EN/BG. */
export function PixelSegmented<T extends string | number>({
  value,
  options,
  onChange,
  className = '',
  'aria-label': ariaLabel,
}: PixelSegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`pixel-inset m-[var(--px)] inline-flex gap-[var(--px)] p-[var(--px)] ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`min-w-10 flex-1 cursor-pointer px-3 py-2 text-[10px] transition-colors sm:text-xs ${
              active
                ? 'bg-gold text-ink shadow-[inset_0_calc(var(--px)*-1)_0_0_var(--color-rust)]'
                : 'bg-night text-mist shadow-[inset_0_var(--px)_0_0_var(--color-slate)] hover:bg-slate hover:text-paper'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
