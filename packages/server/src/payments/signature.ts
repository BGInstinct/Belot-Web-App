/**
 * Revolut Merchant webhook signature verification.
 * Headers: `Revolut-Request-Timestamp` (unix ms) and `Revolut-Signature` (`v1=<hex>`; may contain several,
 * comma-separated, during secret rotation).
 * payload_to_sign = `v1.{timestamp}.{raw_body}`, HMAC-SHA256 with the webhook signing secret, hex encoded.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_VERSION = 'v1';
/** Revolut recommends a 5 minute tolerance. */
export const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

export function computeRevolutSignature(rawBody: string | Buffer, timestamp: string, secret: string): string {
  const hmac = createHmac('sha256', secret);
  hmac.update(`${SIGNATURE_VERSION}.${timestamp}.`);
  hmac.update(rawBody);
  return `${SIGNATURE_VERSION}=${hmac.digest('hex')}`;
}

export type SignatureResult = { ok: true } | { ok: false; reason: string };

export function verifyRevolutSignature(opts: {
  rawBody: string | Buffer;
  signatureHeader: string | undefined;
  timestampHeader: string | undefined;
  secret: string;
  now?: number;
  toleranceMs?: number;
}): SignatureResult {
  const { rawBody, signatureHeader, timestampHeader, secret } = opts;
  if (!signatureHeader || !timestampHeader) return { ok: false, reason: 'missing signature headers' };
  if (!/^\d+$/.test(timestampHeader)) return { ok: false, reason: 'invalid timestamp' };
  const ts = Number(timestampHeader);
  const now = opts.now ?? Date.now();
  if (Math.abs(now - ts) > (opts.toleranceMs ?? DEFAULT_TOLERANCE_MS)) return { ok: false, reason: 'timestamp outside tolerance' };

  const expected = Buffer.from(computeRevolutSignature(rawBody, timestampHeader, secret));
  const candidates = signatureHeader.split(',').map((s) => s.trim()).filter(Boolean);
  let match = false;
  for (const c of candidates) {
    const buf = Buffer.from(c);
    // timingSafeEqual throws on length mismatch; check length first (length is not secret)
    if (buf.length === expected.length && timingSafeEqual(buf, expected)) match = true;
  }
  return match ? { ok: true } : { ok: false, reason: 'signature mismatch' };
}
