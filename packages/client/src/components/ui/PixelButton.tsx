import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type PixelButtonVariant = 'green' | 'red' | 'orange' | 'blue' | 'dark';
export type PixelButtonSize = 'sm' | 'md' | 'lg';

export interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PixelButtonVariant;
  size?: PixelButtonSize;
  /** optional leading icon (e.g. a lucide icon or <SuitIcon/>) */
  icon?: ReactNode;
  /** stretch to the container width */
  block?: boolean;
  /** render in the pressed state (for toggle-like buttons) */
  pressed?: boolean;
}

/**
 * Chunky 9-slice pixel button built from the Bars&Buttons sprite sheet.
 * The face visibly sinks while pressed (`:active`, or `pressed` prop).
 */
export const PixelButton = forwardRef<HTMLButtonElement, PixelButtonProps>(function PixelButton(
  { variant = 'blue', size = 'md', icon, block, pressed, className = '', children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`pixel-btn font-pixel ${block ? 'w-full' : ''} ${className}`}
      data-variant={variant}
      data-size={size}
      data-pressed={pressed ? 'true' : undefined}
      aria-pressed={pressed}
      {...rest}
    >
      {icon && <span className="inline-flex shrink-0 items-center">{icon}</span>}
      {children}
    </button>
  );
});
