# Auth (Supabase + Google) & Payments (Revolut) setup

Everything is optional. With no env vars the app runs **guest-only**: players get a generated
`guest-<uuid>` id and a random editable name (stored in `localStorage`), the shop shows all skins,
free skins can be equipped, and the buy buttons are disabled. The server answers the auth/payment
endpoints with `503` and a clear message.

| Feature | Needs |
| --- | --- |
| Google sign-in | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Owned skins (`/api/shop/owned`) | + `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| Buying skins | + `REVOLUT_SECRET_KEY`, `REVOLUT_API_URL`, `VITE_REVOLUT_MODE` |
| Webhook grants | + `REVOLUT_WEBHOOK_SECRET` (without it, the client-side `sync` fallback still grants) |

Copy `.env.example` to `.env` at the repo root. Both the server (via `dotenv`) and the Vite client
(`envDir` is the repo root; only `VITE_*` variables are exposed to the browser) read this one file.

---

## 1. Supabase project

1. Create a project at <https://supabase.com/dashboard>.
2. **Project Settings → API**: copy
   - Project URL → `SUPABASE_URL` and `VITE_SUPABASE_URL`
   - `anon` public key → `VITE_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**secret — server only**)
3. **Run the migration** `supabase/migrations/20261024000000_auth_shop_payments.sql`:
   - Dashboard: **SQL Editor → New query**, paste the file, **Run**; or
   - CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.

   It creates `profiles` (auto-filled from Google metadata by a trigger on `auth.users`),
   `skin_catalog` (seeded with prices — **the server is the price authority**), `user_skins`
   (`unique(user_id, skin_id)`) and `payment_orders`. RLS is enabled: users can only `select`
   their own rows; there are no write policies, so only the service role (our server) can write.

   To change prices, update `skin_catalog` (and `packages/server/src/payments/catalog.ts`, the fallback
   used when the DB is unreachable). Skin ids must match `packages/client/public/assets/skins/manifest.json`.

### Google provider

1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID**
   (type *Web application*). Configure the OAuth consent screen first if asked.
2. **Authorized redirect URI**: `https://<project-ref>.supabase.co/auth/v1/callback`
   (shown in Supabase under **Authentication → Providers → Google**).
3. In Supabase **Authentication → Providers → Google**: enable, paste the client id + secret.
4. **Authentication → URL Configuration**:
   - Site URL: `http://localhost:5173` (or your production origin)
   - Redirect URLs: add `http://localhost:5173/auth/callback` and `https://<your-domain>/auth/callback`.

The client uses the PKCE flow: `signInWithOAuth({ provider: 'google', options: { redirectTo: origin + '/auth/callback' } })`,
and `/auth/callback` waits for the session, then returns to the page where sign-in started.

---

## 2. Revolut Merchant (sandbox)

1. Create a sandbox account at <https://sandbox-business.revolut.com> → **Merchant API**
   (APIs → Merchant API). Copy the **secret key** (`sk_...`) → `REVOLUT_SECRET_KEY`.
   (The public key is not needed: the widget is initialised with the per-order `token`.)
2. Env:
   ```
   REVOLUT_API_URL=https://sandbox-merchant.revolut.com
   VITE_REVOLUT_MODE=sandbox
   ```
   For production: `REVOLUT_API_URL=https://merchant.revolut.com`, `VITE_REVOLUT_MODE=prod`, production secret key.
3. The server calls `POST {REVOLUT_API_URL}/api/orders` with `Authorization: Bearer <secret>` and
   `Revolut-Api-Version: 2024-09-01`, and passes the returned `token` to `@revolut/checkout`
   (`RevolutCheckout(token, mode)` → `payWithPopup` for cards, `revolutPay` button and the
   `paymentRequest` button for Apple Pay / Google Pay where the browser supports it).
4. Test cards: see Revolut's docs ("Test in the Sandbox environment").
   Apple Pay requires domain verification in the Revolut dashboard and HTTPS.

### Webhook registration

Revolut must reach `POST /api/payments/webhook`. Locally, expose the server with ngrok:

```bash
npm run dev                         # server on :3001
ngrok http 3001                     # -> https://abcd-1-2-3-4.ngrok-free.app
```

Register the webhook (once per URL):

```bash
curl -X POST https://sandbox-merchant.revolut.com/api/1.0/webhooks \
  -H "Authorization: Bearer $REVOLUT_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://abcd-1-2-3-4.ngrok-free.app/api/payments/webhook","events":["ORDER_COMPLETED","ORDER_AUTHORISED","ORDER_CANCELLED","ORDER_PAYMENT_DECLINED","ORDER_PAYMENT_FAILED"]}'
```

The response contains `signing_secret` (`wsk_...`) → set `REVOLUT_WEBHOOK_SECRET` and restart the server.
(Check the current Merchant API reference for the newer versioned `POST /api/webhooks` endpoint if `1.0` is retired.)

The handler verifies `Revolut-Signature` (`v1=<hex>`, possibly several comma-separated during
secret rotation) as HMAC-SHA256 of `v1.{Revolut-Request-Timestamp}.{raw body}`, with a timing-safe
compare and a 5-minute timestamp tolerance. It never trusts the webhook body: it re-fetches the order
from Revolut and grants the skin only if the order is `completed` with the expected amount/currency.
Granting is idempotent (`upsert` on `user_id, skin_id`).

**No webhook?** That's fine for local dev: after the widget's `onSuccess`, the client calls
`POST /api/payments/orders/:id/sync`, which fetches the order from Revolut and grants it if completed.

> The server must not run a global `express.json()` before the payments router — the webhook
> needs the raw body (the router uses `express.raw()` on that route and `express.json()` on the others).

---

## 3. API reference

| Method & path | Auth | Description |
| --- | --- | --- |
| `GET /api/shop/catalog` | – | `{ items: [{id,name,priceCents,currency}], paymentsEnabled }` |
| `GET /api/shop/owned` | Bearer Supabase token | `{ skinIds }` (free skins included) |
| `POST /api/payments/orders` `{skinId}` | Bearer | creates DB + Revolut order → `{ orderId, providerOrderId, token, amount, currency }` (`409` if already owned, `401` for guests) |
| `POST /api/payments/orders/:id/sync` | Bearer (owner) | re-checks order with Revolut → `{ state, granted }` |
| `POST /api/payments/webhook` | `Revolut-Signature` | Revolut events → `204` |

Missing configuration → `503 { error: "service_unavailable", message }`.

---

## 4. Alternative providers

The server talks to the gateway through a small `PaymentProvider` interface
(`packages/server/src/payments/provider.ts`: `createOrder`, `getOrder`). To switch providers,
implement it plus the provider's webhook verification:

- **Stripe Checkout** — mature, great docs; Stripe Tax handles EU VAT (extra fee).
- **Lemon Squeezy** / **Paddle** — *merchant of record*: they collect and remit EU VAT for you,
  at a higher per-transaction fee. Good fit for selling digital goods to EU consumers without
  registering for VAT OSS yourself.
