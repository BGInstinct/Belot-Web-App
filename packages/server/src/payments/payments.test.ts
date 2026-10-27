import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createPaymentsRouter, type PaymentsDeps } from './router';
import { RevolutProvider, REVOLUT_API_VERSION } from './revolut';
import { computeRevolutSignature } from './signature';
import type { AuthUser, PaymentOrderRow, ShopStore } from './store';

const USER: AuthUser = { id: 'user-1', email: 'u@example.com', name: 'Ivan' };
const SECRET = 'wsk_test';

/** In-memory stand-in for the Supabase-backed store. */
class MemoryStore implements ShopStore {
  orders: PaymentOrderRow[] = [];
  skins: { user_id: string; skin_id: string; order_id: string }[] = [];
  profiles: string[] = [];
  async getUser(token: string) {
    return token === 'good-token' ? USER : null;
  }
  async getCatalog() {
    return null; // fall back to static catalog
  }
  async getOwnedSkinIds(userId: string) {
    return this.skins.filter((s) => s.user_id === userId).map((s) => s.skin_id);
  }
  async ensureProfile(u: AuthUser) {
    if (!this.profiles.includes(u.id)) this.profiles.push(u.id);
  }
  async createOrder(row: Omit<PaymentOrderRow, 'id' | 'revolut_order_id'>) {
    const r = { ...row, id: `ord-${this.orders.length + 1}`, revolut_order_id: null };
    this.orders.push(r);
    return r;
  }
  async setProviderOrderId(id: string, pid: string, state: string) {
    Object.assign(this.orders.find((o) => o.id === id)!, { revolut_order_id: pid, state });
  }
  async getOrderById(id: string) {
    return this.orders.find((o) => o.id === id) ?? null;
  }
  async getOrderByProviderId(pid: string) {
    return this.orders.find((o) => o.revolut_order_id === pid) ?? null;
  }
  async updateOrderState(id: string, state: string) {
    this.orders.find((o) => o.id === id)!.state = state;
  }
  async grantSkin(user_id: string, skin_id: string, order_id: string) {
    if (!this.skins.some((s) => s.user_id === user_id && s.skin_id === skin_id)) this.skins.push({ user_id, skin_id, order_id });
  }
}

let server: Server;
let base: string;
let store: MemoryStore;
let revolutState: string;
let revolutAmount: number;
const fetchMock = vi.fn();

async function start(deps: Partial<PaymentsDeps> = {}) {
  const app = express();
  app.use(
    '/api',
    createPaymentsRouter({
      store,
      provider: new RevolutProvider('sk_test', 'https://sandbox-merchant.revolut.com/', fetchMock as unknown as typeof fetch),
      webhookSecret: SECRET,
      log: { warn: () => {}, error: () => {}, info: () => {} },
      ...deps,
    }),
  );
  await new Promise<void>((r) => {
    server = app.listen(0, () => r());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
}

beforeEach(() => {
  store = new MemoryStore();
  revolutState = 'pending';
  revolutAmount = 199;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init: RequestInit) => {
    const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (url === 'https://sandbox-merchant.revolut.com/api/orders' && init.method === 'POST') {
      const b = JSON.parse(String(init.body));
      return ok({ id: 'rev-1', token: 'pub-token-1', state: 'pending', amount: b.amount, currency: b.currency }, 201);
    }
    if (url === 'https://sandbox-merchant.revolut.com/api/orders/rev-1') {
      return ok({ id: 'rev-1', token: 'pub-token-1', state: revolutState, amount: revolutAmount, currency: 'EUR' });
    }
    return ok({ message: 'not found' }, 404);
  });
});

afterEach(async () => {
  await new Promise((r) => server.close(r));
});

const auth = { Authorization: 'Bearer good-token', 'Content-Type': 'application/json' };

async function createOrder(skinId = 'fire') {
  return fetch(`${base}/payments/orders`, { method: 'POST', headers: auth, body: JSON.stringify({ skinId }) });
}

function webhook(payload: unknown, opts: { ts?: number; secret?: string } = {}) {
  const raw = JSON.stringify(payload);
  const ts = String(opts.ts ?? Date.now());
  return fetch(`${base}/payments/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Revolut-Request-Timestamp': ts,
      'Revolut-Signature': computeRevolutSignature(raw, ts, opts.secret ?? SECRET),
    },
    body: raw,
  });
}

describe('shop catalog / owned', () => {
  it('returns the catalog with server prices', async () => {
    await start();
    const r = await fetch(`${base}/shop/catalog`);
    const body = await r.json();
    expect(r.status).toBe(200);
    expect(body.paymentsEnabled).toBe(true);
    expect(body.items.find((i: { id: string }) => i.id === 'default').priceCents).toBe(0);
    expect(body.items.find((i: { id: string }) => i.id === 'fire').priceCents).toBe(199);
  });

  it('owned requires auth and includes free skins', async () => {
    await start();
    expect((await fetch(`${base}/shop/owned`)).status).toBe(401);
    expect((await fetch(`${base}/shop/owned`, { headers: { Authorization: 'Bearer bad' } })).status).toBe(401);
    const body = await (await fetch(`${base}/shop/owned`, { headers: auth })).json();
    expect(body.skinIds).toContain('default');
    expect(body.skinIds).not.toContain('fire');
  });

  it('returns 503 when not configured', async () => {
    await start({ store: null, provider: null, webhookSecret: null });
    expect((await fetch(`${base}/shop/catalog`)).status).toBe(200);
    expect((await fetch(`${base}/shop/owned`, { headers: auth })).status).toBe(503);
    expect((await createOrder()).status).toBe(503);
    const w = await webhook({ event: 'ORDER_COMPLETED', order_id: 'rev-1' });
    expect(w.status).toBe(503);
    expect((await w.json()).message).toMatch(/not configured/);
  });
});

describe('order + webhook flow', () => {
  it('creates a Revolut order with the server-side price', async () => {
    await start();
    const r = await createOrder('fire');
    expect(r.status).toBe(201);
    const body = await r.json();
    expect(body).toMatchObject({ orderId: 'ord-1', token: 'pub-token-1', providerOrderId: 'rev-1', amount: 199, currency: 'EUR' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sandbox-merchant.revolut.com/api/orders');
    expect(init.headers.Authorization).toBe('Bearer sk_test');
    expect(init.headers['Revolut-Api-Version']).toBe(REVOLUT_API_VERSION);
    expect(JSON.parse(init.body)).toMatchObject({ amount: 199, currency: 'EUR', merchant_order_data: { reference: 'ord-1' } });
    expect(store.orders[0]).toMatchObject({ user_id: 'user-1', skin_id: 'fire', revolut_order_id: 'rev-1', amount: 199 });
  });

  it('rejects guests, unknown and free skins', async () => {
    await start();
    expect((await fetch(`${base}/payments/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"skinId":"fire"}' })).status).toBe(401);
    expect((await createOrder('nope')).status).toBe(404);
    expect((await createOrder('default')).status).toBe(400);
    expect((await createOrder('../x')).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('grants the skin on a signed ORDER_COMPLETED webhook, idempotently', async () => {
    await start();
    await createOrder('fire');
    revolutState = 'completed';
    const evt = { event: 'ORDER_COMPLETED', order_id: 'rev-1', merchant_order_ext_ref: 'ord-1' };
    expect((await webhook(evt)).status).toBe(204);
    expect((await webhook(evt)).status).toBe(204);
    expect(store.skins).toEqual([{ user_id: 'user-1', skin_id: 'fire', order_id: 'ord-1' }]);
    expect(store.orders[0].state).toBe('completed');
    const owned = await (await fetch(`${base}/shop/owned`, { headers: auth })).json();
    expect(owned.skinIds).toContain('fire');
    expect((await createOrder('fire')).status).toBe(409);
  });

  it('rejects webhooks with bad signatures or stale timestamps', async () => {
    await start();
    await createOrder('fire');
    revolutState = 'completed';
    expect((await webhook({ event: 'ORDER_COMPLETED', order_id: 'rev-1' }, { secret: 'wrong' })).status).toBe(401);
    expect((await webhook({ event: 'ORDER_COMPLETED', order_id: 'rev-1' }, { ts: Date.now() - 10 * 60_000 })).status).toBe(401);
    expect(store.skins).toHaveLength(0);
  });

  it('does not grant when Revolut says the order is not completed (body is not trusted)', async () => {
    await start();
    await createOrder('fire');
    revolutState = 'pending';
    expect((await webhook({ event: 'ORDER_COMPLETED', order_id: 'rev-1' })).status).toBe(204);
    expect(store.skins).toHaveLength(0);
  });

  it('does not grant on amount mismatch', async () => {
    await start();
    await createOrder('fire');
    revolutState = 'completed';
    revolutAmount = 1;
    await webhook({ event: 'ORDER_COMPLETED', order_id: 'rev-1' });
    expect(store.skins).toHaveLength(0);
    expect(store.orders[0].state).toBe('amount_mismatch');
  });

  it('sync fallback grants a completed order, only for its owner', async () => {
    await start();
    await createOrder('fire');
    let r = await fetch(`${base}/payments/orders/ord-1/sync`, { method: 'POST', headers: auth });
    expect(await r.json()).toEqual({ state: 'pending', granted: false });
    revolutState = 'completed';
    r = await fetch(`${base}/payments/orders/ord-1/sync`, { method: 'POST', headers: auth });
    expect(await r.json()).toEqual({ state: 'completed', granted: true });
    expect(store.skins).toHaveLength(1);
    store.orders[0].user_id = 'someone-else';
    expect((await fetch(`${base}/payments/orders/ord-1/sync`, { method: 'POST', headers: auth })).status).toBe(404);
  });
});
