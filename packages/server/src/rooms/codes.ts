import { randomInt } from 'node:crypto';

/** A-Z and 2-9 without the ambiguous 0, O, 1, I. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export function generateRoomCode(exists: (code: string) => boolean = () => false): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    if (!exists(code)) return code;
  }
  throw new Error('could not allocate a room code');
}

/** Case-insensitive, whitespace/dash tolerant. Returns null when the input can't be a room code. */
export function normalizeRoomCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 32) return null;
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  return CODE_RE.test(code) ? code : null;
}
