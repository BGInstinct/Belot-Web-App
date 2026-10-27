import type { ReactNode } from 'react';

export type PixelProgressColor = 'green' | 'orange' | 'red' | 'blue';

export interface PixelProgressBarProps {
  /** progress 0..1 */
  value: number;
  color?: PixelProgressColor;
  className?: string;
  /** optional icon/label drawn at the left inside the track (like the sprite sheet bars) */
  icon?: ReactNode;
  /** optional text shown at the right of the bar */
  label?: ReactNode;
  /** snap the fill to N discrete segments for a chunkier look (default: continuous) */
  segments?: number;
  /** blink when value is low (<= 0.2) — handy for turn timers */
  warnLow?: boolean;
  'aria-label'?: string;
}

export function PixelProgressBar({
  value,
  color = 'green',
  className = '',
  icon,
  label,
  segments,
  warnLow,
  'aria-label': ariaLabel,
}: PixelProgressBarProps) {
  let v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  if (segments && segments > 0) v = Math.ceil(v * segments) / segments;
  const low = warnLow && v <= 0.2 && v > 0;
  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={ariaLabel}
    >
      <div className="pixel-inset relative flex h-[calc(var(--px)*6)] min-w-0 flex-1 items-center overflow-hidden m-[var(--px)]">
        {icon && <span className="z-10 flex shrink-0 items-center px-[calc(var(--px)*2)]">{icon}</span>}
        <div className="relative h-full flex-1 p-[var(--px)]">
          <div
            className={`pixel-progress-fill h-full transition-[width] duration-200 ease-linear ${low ? 'animate-blink' : ''}`}
            data-color={color}
            style={{ width: `${v * 100}%` }}
          />
        </div>
      </div>
      {label != null && <span className="shrink-0 text-[10px] tabular-nums text-bone">{label}</span>}
    </div>
  );
}
