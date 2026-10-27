/**
 * Minimal payment-provider abstraction so another gateway (e.g. Stripe Checkout) can be
 * added later by implementing this interface and its webhook verification.
 */
export type ProviderOrderState = 'pending' | 'processing' | 'authorised' | 'completed' | 'cancelled' | 'failed';

export interface ProviderOrder {
  /** provider's permanent order id */
  id: string;
  /** public token passed to the client-side widget */
  token: string;
  state: ProviderOrderState;
  amount: number;
  currency: string;
  /** our own reference (payment_orders.id) */
  merchantRef?: string;
}

export interface CreateOrderInput {
  amount: number;
  currency: string;
  description: string;
  merchantRef: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
}

export interface PaymentProvider {
  readonly name: string;
  createOrder(input: CreateOrderInput): Promise<ProviderOrder>;
  getOrder(id: string): Promise<ProviderOrder>;
}
