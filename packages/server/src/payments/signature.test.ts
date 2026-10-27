import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { computeRevolutSignature, verifyRevolutSignature } from './signature';

const secret = 'wsk_test_secret';
const body = '{"event":"ORDER_COMPLETED","order_id":"abc"}';
const ts = '1700000000000';

describe('revolut webhook signature', () => {
  it('computes v1 HMAC-SHA256 over v1.{timestamp}.{body}', () => {
    const expected = createHmac('sha256', secret).update(`v1.${ts}.${body}`).digest('hex');
    expect(computeRevolutSignature(body, ts, secret)).toBe(`v1=${expected}`);
    expect(computeRevolutSignature(Buffer.from(body), ts, secret)).toBe(`v1=${expected}`);
  });

  it('accepts a valid signature within tolerance', () => {
    const sig = computeRevolutSignature(body, ts, secret);
    expect(verifyRevolutSignature({ rawBody: body, signatureHeader: sig, timestampHeader: ts, secret, now: Number(ts) + 1000 })).toEqual({ ok: true });
  });

  it('accepts when one of several comma-separated signatures matches (secret rotation)', () => {
    const sig = computeRevolutSignature(body, ts, secret);
    const header = `v1=${'0'.repeat(64)}, ${sig}`;
    expect(verifyRevolutSignature({ rawBody: body, signatureHeader: header, timestampHeader: ts, secret, now: Number(ts) }).ok).toBe(true);
  });

  it('rejects tampered body, wrong secret, malformed header', () => {
    const sig = computeRevolutSignature(body, ts, secret);
    const now = Number(ts);
    expect(verifyRevolutSignature({ rawBody: body + ' ', signatureHeader: sig, timestampHeader: ts, secret, now }).ok).toBe(false);
    expect(verifyRevolutSignature({ rawBody: body, signatureHeader: sig, timestampHeader: ts, secret: 'other', now }).ok).toBe(false);
    expect(verifyRevolutSignature({ rawBody: body, signatureHeader: 'v1=short', timestampHeader: ts, secret, now }).ok).toBe(false);
    expect(verifyRevolutSignature({ rawBody: body, signatureHeader: undefined, timestampHeader: ts, secret, now }).ok).toBe(false);
  });

  it('rejects stale or future timestamps and timestamp tampering', () => {
    const sig = computeRevolutSignature(body, ts, secret);
    const r = verifyRevolutSignature({ rawBody: body, signatureHeader: sig, timestampHeader: ts, secret, now: Number(ts) + 6 * 60_000 });
    expect(r).toEqual({ ok: false, reason: 'timestamp outside tolerance' });
    expect(verifyRevolutSignature({ rawBody: body, signatureHeader: sig, timestampHeader: ts, secret, now: Number(ts) - 6 * 60_000 }).ok).toBe(false);
    expect(verifyRevolutSignature({ rawBody: body, signatureHeader: sig, timestampHeader: String(Number(ts) + 1), secret, now: Number(ts) }).ok).toBe(false);
    expect(verifyRevolutSignature({ rawBody: body, signatureHeader: sig, timestampHeader: 'abc', secret, now: Number(ts) }).ok).toBe(false);
  });
});
