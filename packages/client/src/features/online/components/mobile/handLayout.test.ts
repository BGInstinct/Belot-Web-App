import { describe, expect, it } from 'vitest';
import { handHeight, mobileHandLayout, mobileHandScale } from './handLayout';
import { isPortraitPhone } from '../../useIsPortraitPhone';

describe('portrait phone detection', () => {
  it('matches portrait phones only', () => {
    expect(isPortraitPhone(360, 640)).toBe(true);
    expect(isPortraitPhone(412, 915)).toBe(true);
    expect(isPortraitPhone(800, 380)).toBe(false);
    expect(isPortraitPhone(768, 1024)).toBe(false);
    expect(isPortraitPhone(1366, 768)).toBe(false);
  });
});

describe('mobile hand layout', () => {
  it('uses integer scales and two rows of 4 for a full hand on common phones', () => {
    for (const [w, h, s] of [
      [360, 251, 3],
      [363, 269, 3],
      [378, 387, 4],
    ] as const) {
      const scale = mobileHandScale(w, h);
      expect(scale).toBe(s);
      const l = mobileHandLayout(8, scale, w);
      expect(l.rows).toEqual([4, 4]);
      expect(Number.isInteger(l.step)).toBe(true);
      expect(l.step).toBeGreaterThanOrEqual(Math.round(23 * scale * 0.8));
      expect(l.height).toBeLessThanOrEqual(h);
    }
  });

  it('keeps every card inside the width', () => {
    for (const w of [348, 363, 378, 400]) {
      for (let n = 1; n <= 8; n++) {
        const s = mobileHandScale(w, 1000);
        const l = mobileHandLayout(n, s, w);
        for (const k of l.rows) expect(23 * s + l.step * Math.max(0, k - 1)).toBeLessThanOrEqual(w);
        expect(l.rows.reduce((a, b) => a + b, 0)).toBe(n);
      }
    }
  });

  it('falls back to smaller cards when the height budget is tight', () => {
    expect(mobileHandScale(360, handHeight(3, 2) - 1)).toBe(2);
  });
});
