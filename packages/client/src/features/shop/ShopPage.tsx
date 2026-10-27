/** OWNED BY payments/auth agent. /shop — card skins, card backs and desk backgrounds; buy via Revolut, equip owned items. */
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Lock, LogIn, ShoppingCart } from 'lucide-react';
import { PixelBadge, PixelButton, PixelModal, PixelPanel, PixelScreen } from '@/components/ui';
import { skinDisplayName, useEquippedCosmetics, type SkinManifestEntry } from '@/skins';
import { useAuthStore } from '@/auth/authStore';
import { isSupabaseEnabled } from '@/lib/supabase';
import CheckoutModal, { type CheckoutOrder } from './CheckoutModal';
import { equip, type EquipKind } from './equip';
import { formatPrice, shopApi, ShopApiError } from './shopApi';
import { useShopData } from './useShopData';

type Tab = 'skins' | 'backs' | 'backgrounds';
const PREVIEW_CARDS = ['A_hearts', 'K_spades', 'Q_diamonds', 'J_clubs'];
const SUIT_ORDER = ['S', 'H', 'D', 'C'] as const;

function Notice({ tone, children }: { tone: 'info' | 'warn' | 'error'; children: React.ReactNode }) {
  const cls = { info: 'bg-night/90 text-bone', warn: 'bg-rust/90 text-paper', error: 'bg-wine/90 text-paper' }[tone];
  return <div className={`pixel-border mb-4 flex flex-wrap items-center gap-3 p-3 text-[9px] leading-relaxed sm:text-[10px] ${cls}`}>{children}</div>;
}

export default function ShopPage() {
  const { t, i18n } = useTranslation('shop');
  const lang = i18n.language;
  const user = useAuthStore((s) => s.user);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const equipped = useEquippedCosmetics();
  const { skins, backgrounds, owned, priceOf, paymentsEnabled, loading, serverError, refreshOwned } = useShopData();

  const [tab, setTab] = useState<Tab>('skins');
  const [busySkin, setBusySkin] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<CheckoutOrder | null>(null);
  const [signInPrompt, setSignInPrompt] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const flash = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ text, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  const name = (s: SkinManifestEntry) => skinDisplayName(s, lang);
  const priceLabel = (id: string) => {
    const p = priceOf(id);
    return p.cents === 0 ? t('free') : formatPrice(p.cents, p.currency, lang);
  };

  const doEquip = (kind: EquipKind, id: string) => {
    equip(kind, id);
    flash(t('equippedToast'));
  };

  const buy = async (skin: SkinManifestEntry) => {
    if (!user) return setSignInPrompt(true);
    setBusySkin(skin.id);
    try {
      const o = await shopApi.createOrder(skin.id);
      setCheckout({ orderId: o.orderId, token: o.token, title: name(skin), priceLabel: formatPrice(o.amount, o.currency, lang) });
    } catch (e) {
      if (e instanceof ShopApiError && e.code === 'already_owned') {
        await refreshOwned();
        flash(t('alreadyOwned'));
      } else if (e instanceof ShopApiError && e.status === 503) flash(t('paymentsUnavailable'), 'err');
      else flash(t('orderFailed'), 'err');
    } finally {
      setBusySkin(null);
    }
  };

  /** Widget reported success: confirm with the server (webhooks may not reach localhost), with short retries. */
  const onPaid = async (orderId: string) => {
    setCheckout(null);
    flash(t('confirming'));
    for (let i = 0; i < 6; i++) {
      try {
        const r = await shopApi.syncOrder(orderId);
        if (r.granted) {
          await refreshOwned();
          return flash(t('purchaseSuccess'));
        }
        if (['failed', 'cancelled', 'amount_mismatch'].includes(r.state)) return flash(t('purchaseFailed'), 'err');
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
    await refreshOwned();
    flash(t('purchasePending'));
  };

  const allBacks = skins.flatMap((s) => s.backs.map((b) => ({ ...b, skin: s })));
  const equippedSkin = skins.find((s) => s.id === equipped.skinId);

  const skinAction = (skin: SkinManifestEntry) => {
    if (owned.has(skin.id)) {
      return equipped.skinId === skin.id ? (
        <PixelBadge color="green">
          <Check size={10} strokeWidth={4} /> {t('equipped')}
        </PixelBadge>
      ) : (
        <PixelButton variant="blue" size="sm" onClick={() => doEquip('skin', skin.id)}>
          {t('equip')}
        </PixelButton>
      );
    }
    if (!user)
      return (
        <PixelButton variant="orange" size="sm" icon={<Lock size={12} strokeWidth={3} />} onClick={() => setSignInPrompt(true)}>
          {t('signInToBuy')}
        </PixelButton>
      );
    return (
      <PixelButton
        variant="green"
        size="sm"
        icon={<ShoppingCart size={12} strokeWidth={3} />}
        disabled={!paymentsEnabled || busySkin !== null}
        title={paymentsEnabled ? undefined : t('paymentsUnavailable')}
        onClick={() => void buy(skin)}
      >
        {busySkin === skin.id ? t('processing') : t('buyFor', { price: priceLabel(skin.id) })}
      </PixelButton>
    );
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'skins', label: t('tabs.skins') },
    { id: 'backs', label: t('tabs.backs') },
    { id: 'backgrounds', label: t('tabs.backgrounds') },
  ];

  return (
    <PixelScreen title={t('title')} back="/">
      <div className="mx-auto w-full max-w-6xl p-3 sm:p-6">
        {!user && (
          <Notice tone="info">
            <span className="flex-1">{isSupabaseEnabled ? t('guestBanner') : t('guestBannerNoAuth')}</span>
            {isSupabaseEnabled && (
              <PixelButton variant="green" size="sm" icon={<LogIn size={12} strokeWidth={3} />} onClick={() => void signInWithGoogle()}>
                {t('signInGoogle')}
              </PixelButton>
            )}
          </Notice>
        )}
        {serverError && <Notice tone="error">{t('serverOffline')}</Notice>}
        {!serverError && !paymentsEnabled && !loading && user && <Notice tone="warn">{t('paymentsUnavailable')}</Notice>}

        <div role="tablist" className="mb-4 flex flex-wrap gap-3">
          {tabs.map((x) => (
            <PixelButton key={x.id} role="tab" aria-selected={tab === x.id} pressed={tab === x.id} variant={tab === x.id ? 'orange' : 'dark'} size="sm" onClick={() => setTab(x.id)}>
              {x.label}
            </PixelButton>
          ))}
        </div>

        {loading ? (
          <p className="text-shadow-px animate-pulse text-[10px] text-bone">{t('loading')}</p>
        ) : tab === 'skins' ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {skins.map((skin) => (
              <PixelPanel
                key={skin.id}
                title={name(skin)}
                actions={owned.has(skin.id) ? <PixelBadge color="slate">{t('owned')}</PixelBadge> : <PixelBadge color="gold">{priceLabel(skin.id)}</PixelBadge>}
              >
                <div className="flex flex-col gap-3">
                  <div
                    className="pixel-inset flex items-end justify-center gap-1 px-2 py-4"
                    style={skin.background ? { backgroundImage: `url(${skin.background})`, backgroundSize: '96px' } : undefined}
                  >
                    {PREVIEW_CARDS.map((c, i) => (
                      <img
                        key={c}
                        src={`${skin.basePath}/cards/${c}.png`}
                        alt=""
                        loading="lazy"
                        className="pixelated drop-shadow-[2px_2px_0_rgba(0,0,0,0.6)]"
                        style={{ width: 46, height: 70, transform: `rotate(${(i - 1.5) * 6}deg)` }}
                      />
                    ))}
                    <img
                      src={skin.backs.find((b) => b.id === skin.defaultBack)?.path ?? skin.backs[0]?.path}
                      alt=""
                      loading="lazy"
                      className="pixelated ml-2 drop-shadow-[2px_2px_0_rgba(0,0,0,0.6)]"
                      style={{ width: 46, height: 70 }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    {SUIT_ORDER.map((s) => {
                      const icon = skin.suitIcons?.[s];
                      const label = (lang === 'bg' ? icon?.labels?.bg : icon?.labels?.en) ?? icon?.label;
                      return icon ? <img key={s} src={icon.path} alt={label} title={label} className="pixelated h-4 w-4" /> : null;
                    })}
                    <span className="ml-auto text-[8px] text-mist sm:text-[9px]">{t('includes', { count: skin.backs.length })}</span>
                  </div>
                  <div className="flex justify-end">{skinAction(skin)}</div>
                </div>
              </PixelPanel>
            ))}
          </div>
        ) : tab === 'backs' ? (
          <PixelPanel tone="glass">
            <p className="mb-4 text-[9px] leading-relaxed text-mist">{t('backsHint')}</p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
              <BackTile
                label={t('followSkin')}
                path={equippedSkin?.backs.find((b) => b.id === equippedSkin.defaultBack)?.path}
                owned
                equipped={equipped.backId === 'default'}
                onClick={() => doEquip('back', 'default')}
              />
              {allBacks.map((b) => {
                const isOwned = owned.has(b.skin.id);
                return (
                  <BackTile
                    key={b.id}
                    label={name(b.skin)}
                    title={isOwned ? (b.name ?? b.id) : t('unlockWith', { skin: name(b.skin) })}
                    path={b.path}
                    owned={isOwned}
                    equipped={equipped.backId !== 'default' && equipped.backId === b.id}
                    onClick={() => doEquip('back', b.id)}
                  />
                );
              })}
            </div>
          </PixelPanel>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {backgrounds.map((bg) => {
              const parent = skins.find((s) => s.id === bg.skinId);
              const isOwned = (bg.priceEurCents ?? 0) === 0 || owned.has(bg.skinId);
              const isEquipped = equipped.backgroundId === bg.id;
              return (
                <PixelPanel key={bg.id} flush>
                  <div
                    className={`h-24 ${isOwned ? '' : 'opacity-50 grayscale'}`}
                    style={{ backgroundImage: `url(${bg.path})`, backgroundSize: `${bg.width * 2}px ${bg.height * 2}px` }}
                  />
                  <div className="flex items-center justify-between gap-2 p-3 text-[9px]">
                    <span className="truncate text-bone">{lang === 'bg' ? bg.name?.bg : bg.name?.en}</span>
                    {isEquipped ? (
                      <PixelBadge color="green">
                        <Check size={10} strokeWidth={4} />
                      </PixelBadge>
                    ) : isOwned ? (
                      <PixelButton variant="blue" size="sm" onClick={() => doEquip('background', bg.id)}>
                        {t('equip')}
                      </PixelButton>
                    ) : (
                      <span className="flex items-center gap-1 text-[8px] text-gold" title={parent ? t('unlockWith', { skin: name(parent) }) : undefined}>
                        <Lock size={10} strokeWidth={3} /> {parent ? name(parent) : t('locked')}
                      </span>
                    )}
                  </div>
                </PixelPanel>
              );
            })}
          </div>
        )}
      </div>

      {toast && (
        <div
          role="status"
          className={`pixel-border fixed bottom-4 left-1/2 z-50 -translate-x-1/2 px-4 py-3 text-[10px] ${toast.tone === 'ok' ? 'bg-moss text-paper' : 'bg-blood text-paper'}`}
        >
          {toast.text}
        </div>
      )}

      <PixelModal open={signInPrompt} onClose={() => setSignInPrompt(false)} title={t('signInTitle')} size="sm">
        <div className="flex flex-col gap-4 text-[10px] leading-relaxed">
          <p>{isSupabaseEnabled ? t('signInBody') : t('guestBannerNoAuth')}</p>
          {isSupabaseEnabled && (
            <PixelButton variant="green" block icon={<LogIn size={12} strokeWidth={3} />} onClick={() => void signInWithGoogle()}>
              {t('signInGoogle')}
            </PixelButton>
          )}
        </div>
      </PixelModal>

      <CheckoutModal order={checkout} onClose={() => setCheckout(null)} onPaid={(id) => void onPaid(id)} />
    </PixelScreen>
  );
}

function BackTile(props: { label: string; title?: string; path?: string; owned: boolean; equipped: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={!props.owned || props.equipped}
      onClick={props.onClick}
      title={props.title ?? props.label}
      className={`pixel-border relative flex cursor-pointer flex-col items-center gap-2 p-2 text-[8px] text-bone ${props.owned ? 'disabled:cursor-default' : 'disabled:cursor-not-allowed'} ${
        props.equipped ? 'bg-pine' : 'bg-night hover:bg-slate'
      }`}
    >
      {props.path && <img src={props.path} alt="" loading="lazy" className={`pixelated ${props.owned ? '' : 'opacity-40 grayscale'}`} style={{ width: 46, height: 70 }} />}
      <span className="w-full truncate text-center">{props.label}</span>
      {!props.owned && <Lock size={14} className="absolute right-1 top-1 text-gold" strokeWidth={3} />}
      {props.equipped && <Check size={14} className="absolute right-1 top-1 text-lime" strokeWidth={4} />}
    </button>
  );
}
