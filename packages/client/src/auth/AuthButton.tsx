/** OWNED BY payments/auth agent. Top-right login button (Google OAuth / Guest) with a pixel dropdown. */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Dices, LogIn, LogOut, Pencil, User } from 'lucide-react';
import { PixelButton, PixelInput } from '@/components/ui';
import { isSupabaseEnabled } from '@/lib/supabase';
import { useAuthStore } from './authStore';
import { GUEST_NAME_MAX } from './guest';

function Avatar({ src, size = 24 }: { src?: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken)
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="pixel-border bg-slate"
        style={{ width: size, height: size, imageRendering: 'auto' }}
      />
    );
  return (
    <span className="pixel-border inline-flex shrink-0 items-center justify-center bg-gold text-ink" style={{ width: size, height: size }}>
      <User size={size - 8} strokeWidth={3} />
    </span>
  );
}

export default function AuthButton() {
  const { t } = useTranslation('auth');
  const { status, user, guest, error, signInWithGoogle, signOut, setGuestName, rerollGuestName } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(guest.name);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setEditing(false);
  }, [open]);

  const displayName = user ? user.name : guest.name;

  const submitName = (e: FormEvent) => {
    e.preventDefault();
    setGuestName(draft);
    setEditing(false);
  };

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setDraft(guest.name);
          setOpen((o) => !o);
        }}
        className="pixel-border flex h-9 cursor-pointer items-center gap-2 bg-slate px-2 text-[9px] text-paper hover:bg-steel active:translate-y-[2px] sm:text-[10px]"
      >
        <Avatar src={user?.avatar} />
        <span className="hidden max-w-[9rem] truncate sm:inline">{status === 'loading' ? t('loading') : displayName}</span>
        {!user && <span className="hidden bg-night px-1 py-[2px] text-[7px] uppercase text-gold md:inline">{t('guest')}</span>}
        <ChevronDown size={14} strokeWidth={3} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            style={{ position: 'absolute' }}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.12, ease: 'linear' }}
            className="pixel-panel absolute right-0 z-50 mt-3 w-72 max-w-[calc(100vw-1rem)] p-4 text-[10px] leading-relaxed text-paper"
          >
            <div className="mb-4 flex items-center gap-3 border-b-[length:var(--px)] border-slate pb-3">
              <Avatar src={user?.avatar} size={32} />
              <div className="min-w-0">
                <div className="text-[8px] text-mist">{user ? t('signedInAs') : t('playingAsGuest')}</div>
                <div className="truncate text-gold">{displayName}</div>
                {user?.email && <div className="truncate text-[8px] text-mist">{user.email}</div>}
              </div>
            </div>

            {!user && (
              <div className="mb-3">
                {editing ? (
                  <form onSubmit={submitName} className="flex flex-col gap-2">
                    <PixelInput
                      id="guest-name-input"
                      label={t('nameLabel')}
                      autoFocus
                      maxLength={GUEST_NAME_MAX}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <PixelButton type="submit" variant="green" size="sm" disabled={!draft.trim()}>
                        {t('save')}
                      </PixelButton>
                      <PixelButton type="button" variant="dark" size="sm" onClick={() => setEditing(false)}>
                        {t('cancel')}
                      </PixelButton>
                    </div>
                  </form>
                ) : (
                  <div className="flex gap-2">
                    <PixelButton variant="blue" size="sm" className="flex-1" icon={<Pencil size={12} strokeWidth={3} />} onClick={() => setEditing(true)}>
                      {t('editName')}
                    </PixelButton>
                    <PixelButton variant="dark" size="sm" title={t('randomName')} aria-label={t('randomName')} onClick={rerollGuestName}>
                      <Dices size={14} strokeWidth={3} />
                    </PixelButton>
                  </div>
                )}
              </div>
            )}

            {user ? (
              <PixelButton
                variant="red"
                size="sm"
                block
                icon={<LogOut size={12} strokeWidth={3} />}
                onClick={() => {
                  void signOut();
                  setOpen(false);
                }}
              >
                {t('signOut')}
              </PixelButton>
            ) : (
              <>
                <span title={isSupabaseEnabled ? undefined : t('signInUnavailable')} className="block">
                  <PixelButton
                    variant="green"
                    size="sm"
                    disabled={!isSupabaseEnabled}
                    block
                    icon={<LogIn size={12} strokeWidth={3} />}
                    onClick={() => void signInWithGoogle()}
                  >
                    {t('signInGoogle')}
                  </PixelButton>
                </span>
                <p className="mt-2 text-[8px] text-mist">{isSupabaseEnabled ? t('guestHint') : t('signInUnavailable')}</p>
              </>
            )}
            {error && <p className="mt-2 text-[8px] text-ember">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
