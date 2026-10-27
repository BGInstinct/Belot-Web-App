/** Skin/background manifests (from `@/skins`), server catalog (prices) and the signed-in user's owned skins. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSkinManifest } from '@/skins';
import { useAuthStore } from '@/auth/authStore';
import { shopApi, type CatalogItem } from './shopApi';

export function useShopData() {
  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.status === 'ready');
  const { skins, backgrounds, loaded } = useSkinManifest();
  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [serverOwned, setServerOwned] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    shopApi
      .catalog()
      .then((c) => {
        if (!alive) return;
        setCatalog(c.items);
        setPaymentsEnabled(c.paymentsEnabled);
      })
      .catch((e: Error) => alive && setServerError(e.message))
      .finally(() => alive && setCatalogLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const refreshOwned = useCallback(async () => {
    if (!user) return setServerOwned([]);
    try {
      setServerOwned((await shopApi.owned()).skinIds);
    } catch {
      setServerOwned([]);
    }
  }, [user]);

  useEffect(() => {
    if (authReady) void refreshOwned();
  }, [authReady, refreshOwned]);

  /** Server catalog is the price authority; the manifest price is only a display fallback. */
  const priceOf = useCallback(
    (skinId: string): { cents: number; currency: string } => {
      const c = catalog?.find((x) => x.id === skinId);
      if (c) return { cents: c.priceCents, currency: c.currency };
      return { cents: skins.find((x) => x.id === skinId)?.priceEurCents ?? 0, currency: 'EUR' };
    },
    [catalog, skins],
  );

  const owned = useMemo(() => {
    const set = new Set<string>(['default', ...serverOwned]);
    for (const s of skins) if (priceOf(s.id).cents === 0) set.add(s.id);
    return set;
  }, [skins, serverOwned, priceOf]);

  return { skins, backgrounds, owned, priceOf, paymentsEnabled, loading: !loaded || !catalogLoaded, serverError, refreshOwned };
}
