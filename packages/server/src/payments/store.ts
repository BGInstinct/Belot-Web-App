/** Persistence for the shop, backed by Supabase (service role — bypasses RLS). */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CatalogItem } from './catalog';

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
}

export interface PaymentOrderRow {
  id: string;
  revolut_order_id: string | null;
  user_id: string;
  skin_id: string;
  amount: number;
  currency: string;
  state: string;
}

export interface ShopStore {
  /** verify a Supabase access token; null when invalid */
  getUser(token: string): Promise<AuthUser | null>;
  getCatalog(): Promise<CatalogItem[] | null>;
  getOwnedSkinIds(userId: string): Promise<string[]>;
  ensureProfile(user: AuthUser): Promise<void>;
  createOrder(row: Omit<PaymentOrderRow, 'id' | 'revolut_order_id'>): Promise<PaymentOrderRow>;
  setProviderOrderId(id: string, providerOrderId: string, state: string): Promise<void>;
  getOrderById(id: string): Promise<PaymentOrderRow | null>;
  getOrderByProviderId(providerOrderId: string): Promise<PaymentOrderRow | null>;
  updateOrderState(id: string, state: string): Promise<void>;
  /** idempotent (upsert on user_id+skin_id) */
  grantSkin(userId: string, skinId: string, orderId: string): Promise<void>;
}

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`Supabase: ${r.error.message}`);
  return r.data;
}

export class SupabaseShopStore implements ShopStore {
  constructor(private db: SupabaseClient) {}

  static fromEnv(url: string, serviceKey: string): SupabaseShopStore {
    return new SupabaseShopStore(createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }));
  }

  async getUser(token: string): Promise<AuthUser | null> {
    const { data, error } = await this.db.auth.getUser(token);
    if (error || !data.user) return null;
    const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
    return {
      id: data.user.id,
      email: data.user.email ?? undefined,
      name: (meta.full_name ?? meta.name) as string | undefined,
      avatarUrl: (meta.avatar_url ?? meta.picture) as string | undefined,
    };
  }

  async getCatalog(): Promise<CatalogItem[] | null> {
    const r = await this.db.from('skin_catalog').select('id,name,price_cents,currency').eq('active', true).order('sort_order');
    if (r.error) return null;
    return (r.data ?? []).map((x: { id: string; name: string; price_cents: number; currency: string }) => ({
      id: x.id,
      name: x.name,
      priceCents: x.price_cents,
      currency: x.currency,
    }));
  }

  async getOwnedSkinIds(userId: string): Promise<string[]> {
    const data = check(await this.db.from('user_skins').select('skin_id').eq('user_id', userId));
    return (data ?? []).map((x: { skin_id: string }) => x.skin_id);
  }

  async ensureProfile(user: AuthUser): Promise<void> {
    check(
      await this.db
        .from('profiles')
        .upsert({ id: user.id, display_name: user.name ?? null, avatar_url: user.avatarUrl ?? null }, { onConflict: 'id', ignoreDuplicates: true }),
    );
  }

  async createOrder(row: Omit<PaymentOrderRow, 'id' | 'revolut_order_id'>): Promise<PaymentOrderRow> {
    return check(await this.db.from('payment_orders').insert(row).select().single()) as PaymentOrderRow;
  }

  async setProviderOrderId(id: string, providerOrderId: string, state: string): Promise<void> {
    check(await this.db.from('payment_orders').update({ revolut_order_id: providerOrderId, state }).eq('id', id));
  }

  async getOrderById(id: string): Promise<PaymentOrderRow | null> {
    return check(await this.db.from('payment_orders').select().eq('id', id).maybeSingle()) as PaymentOrderRow | null;
  }

  async getOrderByProviderId(providerOrderId: string): Promise<PaymentOrderRow | null> {
    return check(await this.db.from('payment_orders').select().eq('revolut_order_id', providerOrderId).maybeSingle()) as PaymentOrderRow | null;
  }

  async updateOrderState(id: string, state: string): Promise<void> {
    check(await this.db.from('payment_orders').update({ state }).eq('id', id));
  }

  async grantSkin(userId: string, skinId: string, orderId: string): Promise<void> {
    check(
      await this.db
        .from('user_skins')
        .upsert({ user_id: userId, skin_id: skinId, order_id: orderId }, { onConflict: 'user_id,skin_id', ignoreDuplicates: true }),
    );
  }
}
