import type { HTMLAttributes, ReactNode } from 'react';

export type PixelPanelTone = 'dark' | 'light' | 'slate' | 'glass' | 'felt';

export interface PixelPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  /** optional element rendered on the right side of the title bar */
  actions?: ReactNode;
  tone?: PixelPanelTone;
  /** remove the default inner padding */
  flush?: boolean;
}

/** Bevelled pixel-art panel with notched corners and an optional title bar. */
export function PixelPanel({ title, actions, tone = 'dark', flush, className = '', children, ...rest }: PixelPanelProps) {
  return (
    <div className={`pixel-panel ${className}`} data-tone={tone} {...rest}>
      {(title || actions) && (
        <div className="pixel-panel-title flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          {title && <h2 className="text-shadow-px m-0 text-[11px] leading-snug text-gold sm:text-sm">{title}</h2>}
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={flush ? '' : 'p-4 sm:p-5'}>{children}</div>
    </div>
  );
}
