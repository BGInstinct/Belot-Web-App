import { useId, type ReactNode } from 'react';

export interface PixelToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  /** secondary line under the label */
  description?: ReactNode;
  disabled?: boolean;
  /** integer sprite scale (default 3) */
  scale?: number;
  className?: string;
}

/** Sprite switch from the Bars&Buttons sheet: red knob-left = off, green knob-right = on. */
export function PixelToggle({ checked, onChange, label, description, disabled, scale = 3, className = '' }: PixelToggleProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`group flex select-none items-center gap-3 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${className}`}
    >
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative shrink-0 cursor-[inherit] border-0 bg-transparent p-0 transition-[filter] group-hover:brightness-110"
        style={{ width: 14 * scale, height: 8 * scale }}
      >
        <img
          src={`/assets/ui/toggles/${checked ? 'green-on' : 'red-off'}.png`}
          alt=""
          draggable={false}
          className="pixelated block h-full w-full"
        />
      </button>
      {(label || description) && (
        <span className="flex min-w-0 flex-col gap-1">
          {label && <span className="text-[11px] leading-snug text-paper sm:text-xs">{label}</span>}
          {description && <span className="text-[9px] leading-relaxed text-mist sm:text-[10px]">{description}</span>}
        </span>
      )}
    </label>
  );
}
