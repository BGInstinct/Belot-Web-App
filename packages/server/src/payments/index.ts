/** OWNED BY payments agent. Mounted by the server at /api (see src/index.ts). */
import { createPaymentsRouter, type PaymentsDeps } from './router';
import { RevolutProvider } from './revolut';
import { SupabaseShopStore } from './store';

let cached: PaymentsDeps | null = null;

/** Built lazily so dotenv has loaded before env vars are read. */
function depsFromEnv(): PaymentsDeps {
  if (cached) return cached;
  const env = process.env;
  const store = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? SupabaseShopStore.fromEnv(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY) : null;
  const provider = env.REVOLUT_SECRET_KEY
    ? new RevolutProvider(env.REVOLUT_SECRET_KEY, env.REVOLUT_API_URL || 'https://sandbox-merchant.revolut.com')
    : null;
  if (!store) console.warn('[payments] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: shop runs in read-only catalog mode.');
  if (!provider) console.warn('[payments] REVOLUT_SECRET_KEY not set: purchases disabled.');
  cached = { store, provider, webhookSecret: env.REVOLUT_WEBHOOK_SECRET || null };
  return cached;
}

export const paymentsRouter = createPaymentsRouter(depsFromEnv);
export { createPaymentsRouter } from './router';
export type { PaymentsDeps } from './router';
export type { PaymentProvider } from './provider';
export { STATIC_CATALOG, type CatalogItem } from './catalog';
