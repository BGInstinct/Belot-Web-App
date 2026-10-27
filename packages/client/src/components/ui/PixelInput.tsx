import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export interface PixelInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

/** Inset pixel text/number field. */
export const PixelInput = forwardRef<HTMLInputElement, PixelInputProps>(function PixelInput(
  { label, hint, error, className = '', id, ...rest },
  ref,
) {
  return (
    <label className={`flex flex-col gap-2 ${className}`} htmlFor={id}>
      {label && <span className="text-[10px] uppercase leading-snug text-mist sm:text-[11px]">{label}</span>}
      <input
        ref={ref}
        id={id}
        className="pixel-inset m-[var(--px)] min-w-0 px-3 py-3 text-sm text-paper caret-gold outline-none placeholder:text-steel focus:shadow-[inset_0_0_0_var(--px)_var(--color-gold)]"
        {...rest}
      />
      {error ? (
        <span className="text-[9px] leading-relaxed text-ember">{error}</span>
      ) : hint ? (
        <span className="text-[9px] leading-relaxed text-mist">{hint}</span>
      ) : null}
    </label>
  );
});
