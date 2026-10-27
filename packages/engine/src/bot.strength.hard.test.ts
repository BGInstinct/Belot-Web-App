/** SLOW (~20–40 s): strength check — hard vs medium tournament with fixed seeds (teams swapped on every seed). (set SKIP_SLOW=1 to skip) */
import { describe, expect, it } from 'vitest';
import { tournament } from './testutil';

describe.skipIf(!!process.env.SKIP_SLOW)('bot strength', () => {
  it('hard beats medium clearly over 100 matches', () => {
    const r = tournament('hard', 'medium', 100, 1);
    console.log(
      `hard vs medium: ${r.winsA}/${r.matches} matches won (${(100 * r.winRateA).toFixed(1)}%), ` +
        `avg points per round ${r.ptsPerRoundA.toFixed(2)} vs ${r.ptsPerRoundB.toFixed(2)} over ${r.rounds} rounds`,
    );
    expect(r.winRateA).toBeGreaterThan(0.58);
    expect(r.ptsPerRoundA).toBeGreaterThan(r.ptsPerRoundB);
  }, 240_000);
});
