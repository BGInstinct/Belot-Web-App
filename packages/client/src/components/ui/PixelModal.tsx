import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface PixelModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  /** footer area (e.g. action buttons) */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  /** prevent closing by backdrop click / Escape */
  dismissible?: boolean;
  className?: string;
}

const SIZE = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  full: 'max-w-none h-full',
} as const;

/** Pixel dialog with a stepped "pop" animation, Escape + backdrop to close. */
export function PixelModal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  dismissible = true,
  className = '',
}: PixelModalProps) {
  const { t } = useTranslation('common');
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissible, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <div
            className="absolute inset-0 bg-ink/80"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgb(0 0 0 / 0.25) 0 2px, transparent 2px 4px)',
            }}
            onClick={dismissible ? onClose : undefined}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`pixel-panel relative flex max-h-full w-full flex-col ${SIZE[size]} ${className}`}
            initial={{ y: 24, scale: 0.9 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 24, scale: 0.9, opacity: 0 }}
            transition={{ type: 'tween', ease: (p: number) => Math.round(p * 5) / 5, duration: 0.18 }}
          >
            <div className="pixel-panel-title flex items-center justify-between gap-3 px-4 py-3">
              <h2 className="text-shadow-px m-0 truncate text-xs text-gold max-sm:min-w-0 max-sm:leading-snug max-sm:whitespace-normal max-sm:text-balance max-sm:wrap-anywhere sm:text-sm">{title}</h2>
              {dismissible && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('close')}
                  className="pixel-border flex h-8 w-8 shrink-0 cursor-pointer max-sm:h-11 max-sm:w-11 items-center justify-center bg-blood text-paper hover:bg-ember active:translate-y-[2px]"
                >
                  <X size={16} strokeWidth={3} />
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
            {footer && <div className="flex flex-wrap justify-end gap-3 border-t-[3px] border-ink px-4 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
