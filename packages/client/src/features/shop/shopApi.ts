/** Client for the server shop/payments API (see packages/server/src/payments/router.ts). */
import { getAccessToken } from '@/auth/useAuth';

const API_BASE = ((import.meta.env.VITE_SERVER_URL as string | undefined) ?? '').replace(/\/+$/, '');

export interface CatalogItem {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
}

export class ShopApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (init.auth) {
    const token = await getAccessToken();
    if (!token) throw new ShopApiError(401, 'unauthorized', 'Not signed in');
    headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { ...init, headers });
  } catch {
    throw new ShopApiError(0, 'network', 'Server unreachable');
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ShopApiError(res.status, String(body.error ?? 'error'), String(body.message ?? res.statusText));
  return body as T;
}

export const shopApi = {
  catalog: () => call<{ items: CatalogItem[]; paymentsEnabled: boolean }>('/shop/catalog'),
  owned: () => call<{ skinIds: string[] }>('/shop/owned', { auth: true }),
  createOrder: (skinId: string) =>
    call<{ orderId: string; providerOrderId: string; token: string; amount: number; currency: string }>('/payments/orders', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ skinId }),
    }),
  syncOrder: (orderId: string) =>
    call<{ state: string; granted: boolean }>(`/payments/orders/${encodeURIComponent(orderId)}/sync`, { method: 'POST', auth: true }),
};

export function formatPrice(cents: number, currency: string, lang: string): string {
  try {
    return new Intl.NumberFormat(lang === 'bg' ? 'bg-BG' : 'en-IE', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
