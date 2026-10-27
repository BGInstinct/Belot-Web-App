/**
 * Shop + payments HTTP routes (mounted at /api by the server):
 *   GET  /shop/catalog                 -> { items: CatalogItem[], paymentsEnabled }
 *   GET  /shop/owned                   (Bearer)  -> { skinIds: string[] }
 *   POST /payments/orders              (Bearer) {skinId} -> { orderId, token, providerOrderId, amount, currency }
 *   POST /payments/orders/:id/sync     (Bearer)  -> { state, granted }
 *   POST /payments/webhook             (Revolut-Signature) -> 204
 */
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import { STATIC_CATALOG, freeSkinIds, type CatalogItem } from './catalog';
import type { PaymentProvider, ProviderOrder } from './provider';
import { verifyRevolutSignature } from './signature';
import type { AuthUser, ShopStore } from './store';

export interface PaymentsDeps {
  /** null when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing */
  store: ShopStore | null;
  /** null when REVOLUT_SECRET_KEY is missing */
  provider: PaymentProvider | null;
  webhookSecret: string | null;
  now?: () => number;
  log?: Pick<Console, 'warn' | 'error' | 'info'>;
}

type DepsSource = PaymentsDeps | (() => PaymentsDeps);

interface AuthedRequest extends Request {
  user?: AuthUser;
}

const SKIN_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function unavailable(res: Response, what: string) {
  res.status(503).json({ error: 'service_unavailable', message: `${what} is not configured on this server. See docs/SETUP_AUTH_PAYMENTS.md.` });
}

export function createPaymentsRouter(source: DepsSource): Router {
  const deps = () => (typeof source === 'function' ? source() : source);
  const log = () => deps().log ?? console;
  const router = Router();
  const json = express.json({ limit: '16kb' });

  async function loadCatalog(): Promise<CatalogItem[]> {
    const store = deps().store;
    if (store) {
      try {
        const c = await store.getCatalog();
        if (c && c.length) return c;
      } catch (e) {
        log().warn('[payments] catalog lookup failed, using static catalog', e);
      }
    }
    return STATIC_CATALOG;
  }

  async function requireUser(req: AuthedRequest, res: Response, next: NextFunction) {
    const store = deps().store;
    if (!store) return unavailable(res, 'Supabase auth');
    const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '');
    if (!m) return res.status(401).json({ error: 'unauthorized', message: 'Sign in with Google to continue.' });
    try {
      const user = await store.getUser(m[1].trim());
      if (!user) return res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired session.' });
      req.user = user;
      next();
    } catch (e) {
      log().error('[payments] auth check failed', e);
      res.status(502).json({ error: 'auth_failed', message: 'Could not verify session.' });
    }
  }

  /** Apply a provider order state to our DB; grants the skin on completion. Idempotent. */
  async function applyOrderState(orderRowId: string, providerOrder: ProviderOrder): Promise<{ state: string; granted: boolean }> {
    const store = deps().store!;
    const row = await store.getOrderById(orderRowId);
    if (!row) throw new Error(`order ${orderRowId} not found`);
    if (providerOrder.state === 'completed') {
      if (providerOrder.amount !== row.amount || providerOrder.currency.toUpperCase() !== row.currency.toUpperCase()) {
        log().error('[payments] amount mismatch', { row, providerOrder });
        await store.updateOrderState(row.id, 'amount_mismatch');
        return { state: 'amount_mismatch', granted: false };
      }
      await store.grantSkin(row.user_id, row.skin_id, row.id);
      if (row.state !== 'completed') await store.updateOrderState(row.id, 'completed');
      return { state: 'completed', granted: true };
    }
    if (row.state !== providerOrder.state && row.state !== 'completed') await store.updateOrderState(row.id, providerOrder.state);
    return { state: providerOrder.state, granted: false };
  }

  router.get('/shop/catalog', async (_req, res) => {
    const d = deps();
    const items = await loadCatalog();
    res.json({ items, paymentsEnabled: Boolean(d.store && d.provider) });
  });

  router.get('/shop/owned', requireUser, async (req: AuthedRequest, res) => {
    try {
      const owned = await deps().store!.getOwnedSkinIds(req.user!.id);
      const all = new Set([...freeSkinIds(await loadCatalog()), ...owned]);
      res.json({ skinIds: [...all] });
    } catch (e) {
      log().error('[payments] owned lookup failed', e);
      res.status(500).json({ error: 'internal', message: 'Could not load owned skins.' });
    }
  });

  router.post('/payments/orders', json, requireUser, async (req: AuthedRequest, res) => {
    const { store, provider } = deps();
    if (!provider) return unavailable(res, 'Revolut payments');
    const skinId = typeof req.body?.skinId === 'string' ? req.body.skinId : '';
    if (!SKIN_ID_RE.test(skinId)) return res.status(400).json({ error: 'bad_request', message: 'Invalid skinId.' });
    const item = (await loadCatalog()).find((c) => c.id === skinId);
    if (!item) return res.status(404).json({ error: 'not_found', message: 'Unknown skin.' });
    if (item.priceCents <= 0) return res.status(400).json({ error: 'free_item', message: 'This skin is free.' });
    const user = req.user!;
    try {
      const owned = await store!.getOwnedSkinIds(user.id);
      if (owned.includes(skinId)) return res.status(409).json({ error: 'already_owned', message: 'You already own this skin.' });
      await store!.ensureProfile(user);
      const row = await store!.createOrder({ user_id: user.id, skin_id: skinId, amount: item.priceCents, currency: item.currency, state: 'created' });
      const order = await provider.createOrder({
        amount: item.priceCents,
        currency: item.currency,
        description: `Belot card skin: ${item.name}`,
        merchantRef: row.id,
        customerEmail: user.email,
        metadata: { skin_id: skinId, user_id: user.id },
      });
      await store!.setProviderOrderId(row.id, order.id, order.state);
      res.status(201).json({ orderId: row.id, providerOrderId: order.id, token: order.token, amount: item.priceCents, currency: item.currency });
    } catch (e) {
      log().error('[payments] create order failed', e);
      res.status(502).json({ error: 'provider_error', message: 'Could not create the payment order. Please try again.' });
    }
  });

  router.post('/payments/orders/:id/sync', requireUser, async (req: AuthedRequest, res) => {
    const { store, provider } = deps();
    if (!provider) return unavailable(res, 'Revolut payments');
    try {
      const row = await store!.getOrderById(req.params.id);
      if (!row || row.user_id !== req.user!.id) return res.status(404).json({ error: 'not_found', message: 'Order not found.' });
      if (!row.revolut_order_id) return res.json({ state: row.state, granted: false });
      const order = await provider.getOrder(row.revolut_order_id);
      res.json(await applyOrderState(row.id, order));
    } catch (e) {
      log().error('[payments] sync failed', e);
      res.status(502).json({ error: 'provider_error', message: 'Could not sync the order.' });
    }
  });

  router.post('/payments/webhook', express.raw({ type: '*/*', limit: '64kb' }), async (req, res) => {
    const { store, provider, webhookSecret, now } = deps();
    if (!store || !provider || !webhookSecret) return unavailable(res, 'Revolut webhooks');
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const sig = verifyRevolutSignature({
      rawBody: raw,
      signatureHeader: req.header('Revolut-Signature'),
      timestampHeader: req.header('Revolut-Request-Timestamp'),
      secret: webhookSecret,
      now: now?.(),
    });
    if (!sig.ok) {
      log().warn('[payments] rejected webhook:', sig.reason);
      return res.status(401).json({ error: 'invalid_signature' });
    }
    let event: { event?: string; order_id?: string; merchant_order_ext_ref?: string };
    try {
      event = JSON.parse(raw.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'bad_json' });
    }
    const relevant = ['ORDER_COMPLETED', 'ORDER_AUTHORISED', 'ORDER_CANCELLED', 'ORDER_PAYMENT_DECLINED', 'ORDER_PAYMENT_FAILED', 'ORDER_FAILED'];
    if (!event.event || !relevant.includes(event.event) || !event.order_id) return res.status(204).end();
    try {
      const row = await store.getOrderByProviderId(event.order_id);
      if (!row) {
        log().warn('[payments] webhook for unknown order', event.order_id);
        return res.status(204).end();
      }
      // Never trust the webhook body for state/amount: re-fetch the order from Revolut.
      const order = await provider.getOrder(event.order_id);
      await applyOrderState(row.id, order);
      res.status(204).end();
    } catch (e) {
      log().error('[payments] webhook processing failed', e);
      // 5xx -> Revolut retries later
      res.status(500).json({ error: 'processing_failed' });
    }
  });

  return router;
}
