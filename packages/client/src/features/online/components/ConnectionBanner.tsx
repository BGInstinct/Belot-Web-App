import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react';
import { useOnline } from '../store';

/** Small banner shown while the socket is (re)connecting. */
export default function ConnectionBanner() {
  const { t } = useTranslation('online');
  const status = useOnline((s) => s.status);
  if (status === 'connected' || status === 'idle') return null;
  return (
    <div className="fixed bottom-2 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2 border-4 border-black bg-amber-500 px-3 py-1 text-[10px] text-black shadow-[3px_3px_0_#000] max-sm:w-max max-sm:max-w-[calc(100vw-1rem)] max-sm:text-balance">
      <WifiOff size={14} className="shrink-0 animate-pulse" /> <span className="min-w-0">{t(`connection.${status}`)}</span>
    </div>
  );
}
