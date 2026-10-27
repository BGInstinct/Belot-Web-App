import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { useOnline } from '../store';

/** Maps server / client error codes to translated text (falls back to the raw message). */
export function useErrorText() {
  const { t, i18n } = useTranslation('online');
  return (code: string) => {
    const key = `errors.${code}`;
    return i18n.exists(key, { ns: 'online' }) ? t(key) : t('errors.generic', { message: code });
  };
}

/** Floating toast for store errors (ack failures). Auto-dismisses. */
export default function ErrorToast() {
  const error = useOnline((s) => s.error);
  const clear = useOnline((s) => s.clearError);
  const text = useErrorText();
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(clear, 3500);
    return () => clearTimeout(id);
  }, [error, clear]);
  return (
    <AnimatePresence>
      {error && (
        <motion.div
          key={error}
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          onClick={clear}
          role="alert"
          className="fixed top-2 left-1/2 z-[100] -translate-x-1/2 cursor-pointer border-4 border-black bg-red-700 px-4 py-2 text-[10px] text-white shadow-[4px_4px_0_#000] max-sm:w-max max-sm:max-w-[calc(100vw-1rem)] max-sm:px-3 max-sm:text-center max-sm:leading-relaxed max-sm:text-balance max-sm:wrap-anywhere"
        >
          {text(error)}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
