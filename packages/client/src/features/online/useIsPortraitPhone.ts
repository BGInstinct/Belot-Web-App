import { useSyncExternalStore } from 'react';

/** Portrait phone viewport: taller than wide and narrower than a tablet. Landscape phones keep the compact desktop layout. */
export function isPortraitPhone(w: number, h: number): boolean {
  return h > w && w < 768;
}

function subscribe(cb: () => void) {
  window.addEventListener('resize', cb);
  window.addEventListener('orientationchange', cb);
  return () => {
    window.removeEventListener('resize', cb);
    window.removeEventListener('orientationchange', cb);
  };
}

const snapshot = () => isPortraitPhone(window.innerWidth, window.innerHeight);

export function useIsPortraitPhone(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
