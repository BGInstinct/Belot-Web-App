/** OWNED BY payments/auth agent. OAuth redirect target (/auth/callback): waits for Supabase to finish the PKCE exchange. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { PixelButton, PixelPanel } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { consumeReturnPath } from './authStore';

export default function AuthCallbackPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(() => {
    const p = new URLSearchParams(window.location.search + window.location.hash.replace(/^#/, '&'));
    return p.get('error_description') ?? p.get('error');
  });

  useEffect(() => {
    if (error) return;
    if (!supabase) {
      navigate('/', { replace: true });
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigate(consumeReturnPath(), { replace: true });
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => session && finish());
    // getSession() awaits the client's initialisation, which performs the ?code= exchange (detectSessionInUrl)
    supabase.auth
      .getSession()
      .then(async ({ data, error: err }) => {
        if (err) return setError(err.message);
        if (data.session) return finish();
        const code = new URLSearchParams(window.location.search).get('code');
        if (code) {
          const r = await supabase!.auth.exchangeCodeForSession(code);
          if (r.error) setError(r.error.message);
          else finish();
        } else setError(t('callback.failed'));
      })
      .catch((e: unknown) => setError(String(e)));
    const timeout = window.setTimeout(() => !done && setError(t('callback.failed')), 15000);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [error, navigate, t]);

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-950 p-6 font-pixel text-white">
      <PixelPanel title={error ? t('callback.failed') : t('callback.signingIn')} className="max-w-md p-6 text-center text-[10px]">
        {error ? (
          <>
            <p className="mb-4 break-words text-red-400">{error}</p>
            <PixelButton variant="blue" onClick={() => navigate('/', { replace: true })}>
              {t('callback.back')}
            </PixelButton>
          </>
        ) : (
          <p className="animate-pulse">…</p>
        )}
      </PixelPanel>
    </div>
  );
}
