import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, generateRoomCode, normalizeRoomCode } from './codes';

describe('room codes', () => {
  it('generates 6-char codes without ambiguous characters', () => {
    for (let i = 0; i < 500; i++) {
      const c = generateRoomCode();
      expect(c).toMatch(/^[A-Z2-9]{6}$/);
      expect(c).not.toMatch(/[01OI]/);
    }
    expect(CODE_ALPHABET).toHaveLength(32);
  });
  it('avoids collisions', () => {
    const seen = new Set<string>();
    let calls = 0;
    const c = generateRoomCode((x) => (calls++ < 3 ? true : seen.has(x)));
    expect(c).toHaveLength(6);
    expect(calls).toBe(4);
  });
  it('normalizes case-insensitively', () => {
    expect(normalizeRoomCode('abc234')).toBe('ABC234');
    expect(normalizeRoomCode(' abc-234 ')).toBe('ABC234');
    expect(normalizeRoomCode('ABC1O4')).toBeNull();
    expect(normalizeRoomCode('ABC23')).toBeNull();
    expect(normalizeRoomCode(123456)).toBeNull();
  });
});
