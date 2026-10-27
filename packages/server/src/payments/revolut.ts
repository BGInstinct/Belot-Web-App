/**
 * Revolut Merchant API adapter.
 * Docs: https://developer.revolut.com/docs/merchant/merchant-api
 *  - POST {base}/api/orders           (create order; returns `id` + `token` for RevolutCheckout)
 *  - GET  {base}/api/orders/{id}      (retrieve order)
 * Headers: `Authorization: Bearer <secret key>`, `Revolut-Api-Version: 2024-09-01`.
 * Base URL: https://sandbox-merchant.revolut.com (sandbox) or https://merchant.revolut.com (prod).
 */
import type { CreateOrderInput, PaymentProvider, ProviderOrder, ProviderOrderState } from './provider';

export const REVOLUT_API_VERSION = '2024-09-01';

type FetchLike = typeof fetch;

interface RevolutOrderResponse {
  id: string;
  token?: string;
  /** deprecated (pre-2023 API) name of `token` */
  public_id?: string;
  state: string;
  amount: number;
  currency: string;
  merchant_order_data?: { reference?: string };
  merchant_order_ext_ref?: string;
}

export class RevolutApiError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Revolut API error ${status}: ${body.slice(0, 300)}`);
  }
}

function normalizeState(s: string): ProviderOrderState {
  const v = s.toLowerCase();
  if (['pending', 'processing', 'authorised', 'completed', 'cancelled', 'failed'].includes(v)) return v as ProviderOrderState;
  return 'pending';
}

function toOrder(r: RevolutOrderResponse): ProviderOrder {
  return {
    id: r.id,
    token: r.token ?? r.public_id ?? '',
    state: normalizeState(r.state),
    amount: r.amount,
    currency: r.currency,
    merchantRef: r.merchant_order_data?.reference ?? r.merchant_order_ext_ref,
  };
}

export class RevolutProvider implements PaymentProvider {
  readonly name = 'revolut';
  private base: string;

  constructor(
    private secretKey: string,
    apiUrl: string,
    private fetchImpl: FetchLike = fetch,
  ) {
    this.base = apiUrl.replace(/\/+$/, '');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Revolut-Api-Version': REVOLUT_API_VERSION,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new RevolutApiError(res.status, text);
    return JSON.parse(text) as T;
  }

  async createOrder(input: CreateOrderInput): Promise<ProviderOrder> {
    const r = await this.request<RevolutOrderResponse>('POST', '/api/orders', {
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      merchant_order_data: { reference: input.merchantRef },
      ...(input.customerEmail ? { customer: { email: input.customerEmail } } : {}),
      metadata: input.metadata,
    });
    return toOrder(r);
  }

  async getOrder(id: string): Promise<ProviderOrder> {
    return toOrder(await this.request<RevolutOrderResponse>('GET', `/api/orders/${encodeURIComponent(id)}`));
  }
}
