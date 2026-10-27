/** Revolut Checkout: card popup + Revolut Pay + Apple/Google Pay (payment request) for one order token. */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import RevolutCheckout, { type RevolutCheckoutInstance, type Mode } from '@revolut/checkout';
import { CreditCard, Loader2 } from 'lucide-react';
import { PixelButton, PixelModal } from '@/components/ui';
import { useAuthStore } from '@/auth/authStore';

const MODE: Mode = (import.meta.env.VITE_REVOLUT_MODE as string | undefined) === 'prod' ? 'prod' : 'sandbox';

export interface CheckoutOrder {
  orderId: string;
  token: string;
  title: string;
  priceLabel: string;
}

type Phase = 'loading' | 'ready' | 'paying' | 'error';

export default function CheckoutModal({
  order,
  onClose,
  onPaid,
}: {
  order: CheckoutOrder | null;
  onClose: () => void;
  /** called once the widget reports success (server sync happens in the parent) */
  onPaid: (orderId: string) => void;
}) {
  const { t, i18n } = useTranslation('shop');
  const email = useAuthStore((s) => s.user?.email);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [walletAvailable, setWalletAvailable] = useState(false);
  const instanceRef = useRef<RevolutCheckoutInstance | null>(null);
  const revolutPayRef = useRef<HTMLDivElement>(null);
  const walletRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({ onPaid, onClose });
  callbacksRef.current = { onPaid, onClose };

  const locale = i18n.language === 'bg' ? 'bg' : 'en';

  useEffect(() => {
    if (!order) return;
    let cancelled = false;
    setPhase('loading');
    setError(null);
    setWalletAvailable(false);
    const common = {
      locale,
      onSuccess: () => callbacksRef.current.onPaid(order.orderId),
      onError: (e: Error) => {
        setError(e.message);
        setPhase('error');
      },
      onCancel: () => setPhase('ready'),
    } as const;

    RevolutCheckout(order.token, MODE)
      .then(async (instance) => {
        if (cancelled) return instance.destroy();
        instanceRef.current = instance;
        setPhase('ready');
        // wait a frame so the mount targets are in the DOM
        await new Promise((r) => requestAnimationFrame(r));
        if (cancelled) return;
        try {
          if (revolutPayRef.current) {
            instance.revolutPay({ ...common, target: revolutPayRef.current, email, buttonStyle: { variant: 'dark', radius: 'none', size: 'small' } });
          }
        } catch (e) {
          console.warn('[shop] Revolut Pay unavailable', e);
        }
        try {
          if (walletRef.current) {
            const pr = instance.paymentRequest({ ...common, target: walletRef.current, buttonStyle: { variant: 'dark', radius: 'none', size: 'small' } });
            const method = await pr.canMakePayment();
            if (method && !cancelled) {
              setWalletAvailable(true);
              await pr.render();
            } else pr.destroy();
          }
        } catch (e) {
          console.warn('[shop] Apple/Google Pay unavailable', e);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      });

    return () => {
      cancelled = true;
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [order, locale, email]);

  const payWithCard = () => {
    const inst = instanceRef.current;
    if (!inst || !order) return;
    setPhase('paying');
    inst.payWithPopup({
      locale,
      email,
      onSuccess: () => callbacksRef.current.onPaid(order.orderId),
      onError: (e) => {
        setError(e.message);
        setPhase('error');
      },
      onCancel: () => setPhase('ready'),
    });
  };

  return (
    <PixelModal open={order !== null} onClose={onClose} title={t('checkout.title')} size="sm">
      {order && (
        <div className="flex flex-col gap-4 text-[10px] leading-relaxed">
          <div className="pixel-inset flex items-center justify-between gap-2 p-3">
            <span className="text-bone">{order.title}</span>
            <span className="text-gold">{order.priceLabel}</span>
          </div>
          {phase === 'loading' && (
            <div className="flex items-center gap-2 text-mist">
              <Loader2 className="animate-spin" size={14} /> {t('checkout.loading')}
            </div>
          )}
          <PixelButton variant="green" block icon={<CreditCard size={14} strokeWidth={3} />} disabled={phase !== 'ready' && phase !== 'error'} onClick={payWithCard}>
            {t('checkout.card')}
          </PixelButton>
          <div className="text-center text-[8px] text-mist">{t('checkout.or')}</div>
          <div ref={revolutPayRef} aria-label="Revolut Pay" className="min-h-[40px]" />
          <div ref={walletRef} aria-label="Apple Pay / Google Pay" className={walletAvailable ? 'min-h-[40px]' : 'hidden'} />
          {MODE === 'sandbox' && <p className="text-[8px] text-amber">{t('checkout.sandboxHint')}</p>}
          {error && <p className="break-words text-[8px] text-ember">{error}</p>}
        </div>
      )}
    </PixelModal>
  );
}
