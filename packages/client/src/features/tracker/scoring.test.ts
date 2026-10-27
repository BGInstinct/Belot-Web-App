import { describe, expect, it } from 'vitest';
import { buildScoreInput, computeSheet, modeTotal, validateFullRound } from './scoring';
import type { FullRound, TrackerRound } from './types';

let n = 0;
const full = (p: Partial<FullRound> = {}): FullRound => ({
  kind: 'full',
  id: `r${++n}`,
  contract: { kind: 'suit', suit: 'S' },
  declarerTeam: 0,
  multiplier: 1,
  trickPoints: [100, 62],
  lastTenTeam: 0,
  announcements: [[], []],
  belots: [0, 0],
  capoTeam: null,
  ...p,
});
const quick = (a: number, b: number, extra: Partial<Extract<TrackerRound, { kind: 'quick' }>> = {}): TrackerRound => ({
  kind: 'quick',
  id: `q${++n}`,
  recorded: [a, b],
  hangingAfter: 0,
  capo: false,
  ...extra,
});

describe('modeTotal / validation', () => {
  it('uses 162 / 258 / 130', () => {
    expect(modeTotal({ kind: 'suit', suit: 'C' })).toBe(162);
    expect(modeTotal({ kind: 'AT' })).toBe(258);
    expect(modeTotal({ kind: 'NT' })).toBe(130);
  });
  it('flags bad point sums, capo mismatch, too many belots and NT announcements', () => {
    expect(validateFullRound(full())).toEqual([]);
    expect(validateFullRound(full({ trickPoints: [100, 50] }))).toContain('errors.pointsSum');
    expect(validateFullRound(full({ trickPoints: [200, -38] }))).toContain('errors.pointsRange');
    expect(validateFullRound(full({ capoTeam: 1 }))).toContain('errors.capoPoints');
    expect(validateFullRound(full({ belots: [1, 1] }))).toContain('errors.belots');
    expect(validateFullRound(full({ contract: { kind: 'AT' }, trickPoints: [200, 58], belots: [2, 2] }))).toEqual([]);
    expect(
      validateFullRound(full({ contract: { kind: 'NT' }, trickPoints: [70, 60], announcements: [['tierce'], []] })),
    ).toContain('errors.noAnnouncementsNT');
  });
  it('builds engine input with chip and belot points', () => {
    const input = buildScoreInput(full({ announcements: [['tierce', 'carre150'], ['quarte']], belots: [1, 0] }), 7);
    expect(input.announcementPoints).toEqual([170, 50]);
    expect(input.belotPoints).toEqual([20, 0]);
    expect(input.hangingBefore).toBe(7);
  });
});

describe('computeSheet (real engine)', () => {
  it('scores a made suit game and accumulates totals', () => {
    const sheet = computeSheet([full({ trickPoints: [100, 62] }), full({ trickPoints: [92, 70], declarerTeam: 1 })]);
    expect(sheet.rows[0].outcome).toBe('made');
    expect(sheet.rows[0].recorded).toEqual([10, 6]);
    // team 1 declared with 70 vs 92 → failed, team 0 takes all 16
    expect(sheet.rows[1].outcome).toBe('failed');
    expect(sheet.rows[1].recorded).toEqual([16, 0]);
    expect(sheet.totals).toEqual([26, 6]);
    expect(sheet.winner).toBeNull();
  });

  it('carries hanging points into the next round and through all-pass rounds', () => {
    const sheet = computeSheet([
      full({ trickPoints: [81, 81] }),
      { kind: 'allPass', id: 'ap' },
      full({ trickPoints: [100, 62] }),
    ]);
    expect(sheet.rows[0].outcome).toBe('hanging');
    expect(sheet.rows[0].recorded[0]).toBe(0);
    const hung = sheet.rows[0].hangingAfter;
    expect(hung).toBeGreaterThan(0);
    expect(sheet.rows[1].outcome).toBe('allPass');
    expect(sheet.rows[1].hangingAfter).toBe(hung);
    expect(sheet.rows[2].hangingBefore).toBe(hung);
    expect(sheet.rows[2].recorded[0]).toBe(10 + hung);
    expect(sheet.hanging).toBe(0);
  });

  it('applies contra / recontra via the engine', () => {
    const contra = computeSheet([full({ multiplier: 2 })]);
    expect(contra.rows[0].recorded).toEqual([32, 0]);
    const recontra = computeSheet([full({ multiplier: 4, trickPoints: [60, 102] })]);
    expect(recontra.rows[0].outcome).toBe('failed');
    expect(recontra.rows[0].recorded).toEqual([0, 64]);
  });

  it('detects the winner at 151+ and ignores rows after the match ended', () => {
    const sheet = computeSheet([quick(140, 20), quick(15, 3), quick(10, 10)]);
    expect(sheet.winner).toBe(0);
    expect(sheet.winnerRoundIndex).toBe(1);
    expect(sheet.totals).toEqual([155, 23]);
    expect(sheet.rows[2].afterMatchEnd).toBe(true);
  });

  it('higher score wins when both pass 151 simultaneously', () => {
    const sheet = computeSheet([quick(145, 148), quick(10, 12)]);
    expect(sheet.winner).toBe(1);
  });

  it('cannot finish on a capo or an all-pass round', () => {
    const capo = full({ trickPoints: [162, 0], capoTeam: 0, lastTenTeam: 0 });
    const sheet = computeSheet([quick(140, 0), capo]);
    expect(sheet.rows[1].recorded).toEqual([25, 0]);
    expect(sheet.totals[0]).toBeGreaterThanOrEqual(151);
    expect(sheet.winner).toBeNull();
    const after = computeSheet([quick(140, 0), capo, full({ trickPoints: [62, 100], declarerTeam: 1 })]);
    expect(after.winner).toBe(0);

    const quickCapo = computeSheet([quick(160, 0, { capo: true })]);
    expect(quickCapo.winner).toBeNull();
    const ap = computeSheet([quick(160, 0, { capo: true }), { kind: 'allPass', id: 'x' }]);
    expect(ap.winner).toBeNull();
  });

  it('cannot finish on a round that leaves points hanging; the next round decides', () => {
    // quick round: team 0 passes 151 but the round leaves points hanging
    const hung = computeSheet([quick(140, 20), quick(15, 0, { hangingAfter: 8 })]);
    expect(hung.totals).toEqual([155, 20]);
    expect(hung.winner).toBeNull();
    expect(hung.winnerRoundIndex).toBeNull();
    expect(hung.hangingBlocksFinish).toBe(true);
    expect(hung.hanging).toBe(8);
    const next = computeSheet([quick(140, 20), quick(15, 0, { hangingAfter: 8 }), quick(10, 6)]);
    expect(next.winner).toBe(0);
    expect(next.winnerRoundIndex).toBe(2);
    expect(next.hangingBlocksFinish).toBe(false);

    // full round: a tie (hanging) after an earlier lead past 151
    const tie = computeSheet([quick(150, 0), full({ trickPoints: [81, 81], declarerTeam: 1 })]);
    expect(tie.rows[1].outcome).toBe('hanging');
    expect(tie.rows[1].hangingAfter).toBeGreaterThan(0);
    expect(tie.totals[0]).toBeGreaterThanOrEqual(151);
    expect(tie.winner).toBeNull();
    expect(tie.hangingBlocksFinish).toBe(true);

    // no hint when nobody is past the target
    expect(computeSheet([full({ trickPoints: [81, 81] })]).hangingBlocksFinish).toBe(false);
  });

  it('records capo as 35 in All Trumps / No Trumps', () => {
    const at = computeSheet([full({ contract: { kind: 'AT' }, trickPoints: [258, 0], capoTeam: 0 })]);
    expect(at.rows[0].recorded).toEqual([35, 0]);
    const nt = computeSheet([full({ contract: { kind: 'NT' }, trickPoints: [0, 130], capoTeam: 1, declarerTeam: 1, lastTenTeam: 1 })]);
    expect(nt.rows[0].recorded).toEqual([0, 35]);
  });

  it('doubles No Trumps and allows multiple belots in All Trumps', () => {
    const nt = computeSheet([full({ contract: { kind: 'NT' }, trickPoints: [80, 50] })]);
    expect(nt.rows[0].recorded).toEqual([16, 10]);
    const at = computeSheet([full({ contract: { kind: 'AT' }, trickPoints: [150, 108], belots: [2, 0] })]);
    expect(at.rows[0].recorded[0] + at.rows[0].recorded[1]).toBe(30);
  });
});
