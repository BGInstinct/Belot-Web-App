import { describe, expect, it } from 'vitest';
import { checkMatchWinner, computeRoundScore } from './index';
import type { Contract, Multiplier, ScoreInput, Team } from './types';

const S: Contract = { kind: 'suit', suit: 'S' };
const NT: Contract = { kind: 'NT' };
const AT: Contract = { kind: 'AT' };

function inp(p: Partial<ScoreInput> & { trickPoints: [number, number] }): ScoreInput {
  return {
    contract: S,
    declarerTeam: 0,
    multiplier: 1,
    announcementPoints: [0, 0],
    belotPoints: [0, 0],
    capoTeam: null,
    hangingBefore: 0,
    ...p,
  };
}

describe('computeRoundScore — suit', () => {
  it('made: both teams record', () => {
    expect(computeRoundScore(inp({ trickPoints: [90, 72] }))).toEqual({ outcome: 'made', recorded: [9, 7], hangingAfter: 0 });
  });
  it('x5 rounds down, x7 rounds up', () => {
    expect(computeRoundScore(inp({ trickPoints: [85, 77] })).recorded).toEqual([8, 8]);
  });
  it('x3/x9', () => {
    expect(computeRoundScore(inp({ trickPoints: [83, 79] })).recorded).toEqual([8, 8]);
  });
  it('both end in 6: fewer raw trick points rounds down', () => {
    expect(computeRoundScore(inp({ trickPoints: [86, 76] })).recorded).toEqual([9, 7]);
    expect(computeRoundScore(inp({ trickPoints: [76, 86], declarerTeam: 1 })).recorded).toEqual([7, 9]);
  });
  it('failed: defenders take all', () => {
    expect(computeRoundScore(inp({ trickPoints: [70, 92] }))).toEqual({ outcome: 'failed', recorded: [0, 16], hangingAfter: 0 });
  });
  it('failed with declarer announcements: defenders take them too', () => {
    const r = computeRoundScore(inp({ trickPoints: [40, 122], announcementPoints: [50, 0], belotPoints: [20, 0] }));
    expect(r).toEqual({ outcome: 'failed', recorded: [0, 23], hangingAfter: 0 });
  });
  it('announcements make the contract', () => {
    const r = computeRoundScore(inp({ trickPoints: [60, 102], announcementPoints: [50, 0] }));
    expect(r).toEqual({ outcome: 'made', recorded: [11, 10], hangingAfter: 0 });
  });
  it('belot counts and can make the contract', () => {
    expect(computeRoundScore(inp({ trickPoints: [72, 90], belotPoints: [20, 0] })).outcome).toBe('made');
  });
  it('hanging: defenders record, declarer points hang', () => {
    expect(computeRoundScore(inp({ trickPoints: [81, 81] }))).toEqual({ outcome: 'hanging', recorded: [0, 8], hangingAfter: 8 });
  });
  it('hanging points go to declarers when next round is made', () => {
    expect(computeRoundScore(inp({ trickPoints: [90, 72], hangingBefore: 8 })).recorded).toEqual([17, 7]);
  });
  it('hanging points go to defenders when next round fails', () => {
    expect(computeRoundScore(inp({ trickPoints: [70, 92], hangingBefore: 8 })).recorded).toEqual([0, 24]);
  });
  it('hanging accumulates on consecutive hanging rounds', () => {
    expect(computeRoundScore(inp({ trickPoints: [81, 81], hangingBefore: 8 })).hangingAfter).toBe(16);
  });
  it('capo: +90, recorded 25', () => {
    expect(computeRoundScore(inp({ trickPoints: [162, 0], capoTeam: 0 }))).toEqual({ outcome: 'made', recorded: [25, 0], hangingAfter: 0 });
    expect(computeRoundScore(inp({ trickPoints: [0, 162], capoTeam: 1 }))).toEqual({ outcome: 'failed', recorded: [0, 25], hangingAfter: 0 });
  });
});

describe('computeRoundScore — AT', () => {
  it('nearest rounding (x5+ up)', () => {
    expect(computeRoundScore(inp({ contract: AT, trickPoints: [145, 113] })).recorded).toEqual([15, 11]);
  });
  it('both end in 4: fewer raw trick points rounds up', () => {
    expect(computeRoundScore(inp({ contract: AT, trickPoints: [134, 124] })).recorded).toEqual([13, 13]);
    expect(computeRoundScore(inp({ contract: AT, trickPoints: [124, 134], declarerTeam: 1 })).recorded).toEqual([13, 13]);
  });
  it('hanging rounds up (154-154 → 15 recorded, 16 hang)', () => {
    const r = computeRoundScore(inp({ contract: AT, trickPoints: [104, 154], announcementPoints: [50, 0] }));
    expect(r).toEqual({ outcome: 'hanging', recorded: [0, 15], hangingAfter: 16 });
  });
  it('capo = 35', () => {
    expect(computeRoundScore(inp({ contract: AT, trickPoints: [258, 0], capoTeam: 0 })).recorded).toEqual([35, 0]);
  });
});

describe('computeRoundScore — NT', () => {
  it('doubles trick points', () => {
    expect(computeRoundScore(inp({ contract: NT, trickPoints: [70, 60] })).recorded).toEqual([14, 12]);
    expect(computeRoundScore(inp({ contract: NT, trickPoints: [67, 63] })).recorded).toEqual([13, 13]);
  });
  it('capo bonus not doubled: 26 + 9 = 35', () => {
    expect(computeRoundScore(inp({ contract: NT, trickPoints: [130, 0], capoTeam: 0 })).recorded).toEqual([35, 0]);
  });
  it('failed', () => {
    expect(computeRoundScore(inp({ contract: NT, trickPoints: [60, 70] }))).toEqual({ outcome: 'failed', recorded: [0, 26], hangingAfter: 0 });
  });
});

describe('contra / recontra', () => {
  it('contra made: declarers take all ×2', () => {
    expect(computeRoundScore(inp({ trickPoints: [100, 62], multiplier: 2 })).recorded).toEqual([32, 0]);
  });
  it('contra failed: defenders take all ×2', () => {
    expect(computeRoundScore(inp({ trickPoints: [60, 102], multiplier: 2 })).recorded).toEqual([0, 32]);
  });
  it('recontra failed: ×4', () => {
    expect(computeRoundScore(inp({ trickPoints: [60, 102], multiplier: 4 })).recorded).toEqual([0, 64]);
  });
  it('recontra made with announcements and hanging before', () => {
    const r = computeRoundScore(inp({ contract: AT, trickPoints: [150, 108], announcementPoints: [100, 20], multiplier: 4, hangingBefore: 5 }));
    expect(r.recorded).toEqual([(26 + 12) * 4 + 5, 0]);
  });
  it('contra hanging: everything ×2 hangs', () => {
    expect(computeRoundScore(inp({ trickPoints: [81, 81], multiplier: 2 }))).toEqual({ outcome: 'hanging', recorded: [0, 0], hangingAfter: 32 });
  });
});

describe('rounding totals are preserved for every split', () => {
  const cases: [Contract, number, number][] = [
    [S, 162, 16],
    [AT, 258, 26],
    [NT, 130, 26],
  ];
  for (const [contract, total, recordedTotal] of cases) {
    it(`${contract.kind} → ${recordedTotal}`, () => {
      for (let a = 0; a <= total; a++) {
        for (const declarerTeam of [0, 1] as Team[]) {
          for (const multiplier of [1, 2, 4] as Multiplier[]) {
            const r = computeRoundScore(inp({ contract, declarerTeam, multiplier, trickPoints: [a, total - a] }));
            expect(r.recorded[0] + r.recorded[1] + r.hangingAfter).toBe(recordedTotal * multiplier);
          }
        }
      }
    });
  }
});

describe('checkMatchWinner', () => {
  const normal = { outcome: 'made', capoTeam: null };
  it('nobody under 151', () => expect(checkMatchWinner([150, 100], normal)).toBeNull());
  it('151 wins', () => expect(checkMatchWinner([151, 100], normal)).toBe(0));
  it('team 1', () => expect(checkMatchWinner([120, 160], normal)).toBe(1));
  it('both over: higher wins', () => expect(checkMatchWinner([160, 155], normal)).toBe(0));
  it('both over and equal: continue', () => expect(checkMatchWinner([160, 160], normal)).toBeNull());
  it('cannot finish on capo', () => expect(checkMatchWinner([170, 100], { outcome: 'made', capoTeam: 0 })).toBeNull());
  it('cannot finish on all-pass', () => expect(checkMatchWinner([170, 100], { outcome: 'allPass', capoTeam: null })).toBeNull());
  it('cannot finish on all-pass that keeps a pot hanging', () =>
    expect(checkMatchWinner([170, 100], { outcome: 'allPass', capoTeam: null, hangingAfter: 8 })).toBeNull());
  it('cannot finish on a hanging round even if the defenders crossed 151 with their recorded points', () => {
    expect(checkMatchWinner([100, 158], { outcome: 'hanging', capoTeam: null, hangingAfter: 8 })).toBeNull();
    expect(checkMatchWinner([170, 160], { outcome: 'hanging', capoTeam: null, hangingAfter: 32 })).toBeNull();
  });
  it('the decided round resolving the pot can finish the match', () => {
    expect(checkMatchWinner([158, 100], { outcome: 'made', capoTeam: null, hangingAfter: 0 })).toBe(0);
    expect(checkMatchWinner([100, 158], { outcome: 'failed', capoTeam: null, hangingAfter: 0 })).toBe(1);
  });
  it('hangingAfter omitted → treated as 0', () => expect(checkMatchWinner([151, 0], { outcome: 'made', capoTeam: null })).toBe(0));
});

describe('outcome rules (Вън / Вътре / Висящо) — explicit', () => {
  it('made: declarers strictly more → both record their own points', () => {
    expect(computeRoundScore(inp({ trickPoints: [82, 80] }))).toEqual({ outcome: 'made', recorded: [8, 8], hangingAfter: 0 });
    expect(computeRoundScore(inp({ trickPoints: [80, 82], declarerTeam: 1 }))).toEqual({ outcome: 'made', recorded: [8, 8], hangingAfter: 0 });
  });
  it('failed: declarers strictly fewer → defenders take ALL points incl. declarer announcements & belot', () => {
    expect(computeRoundScore(inp({ trickPoints: [80, 82] }))).toEqual({ outcome: 'failed', recorded: [0, 16], hangingAfter: 0 });
    const r = computeRoundScore(inp({ trickPoints: [50, 112], announcementPoints: [20, 0], belotPoints: [20, 0], declarerTeam: 0 }));
    expect(r).toEqual({ outcome: 'failed', recorded: [0, 20], hangingAfter: 0 });
  });
  it('hanging: exactly equal (announcements included) → declarers 0, defenders own, declarers hang', () => {
    const r = computeRoundScore(inp({ trickPoints: [61, 101], announcementPoints: [40, 0], declarerTeam: 0 }));
    expect(r).toEqual({ outcome: 'hanging', recorded: [0, 10], hangingAfter: 10 });
    expect(computeRoundScore(inp({ trickPoints: [81, 81], declarerTeam: 1 }))).toEqual({ outcome: 'hanging', recorded: [8, 0], hangingAfter: 8 });
  });
  it('NT hanging: 65-65 → 130-130 doubled, 13 recorded, 13 hang', () => {
    expect(computeRoundScore(inp({ contract: NT, trickPoints: [65, 65] }))).toEqual({ outcome: 'hanging', recorded: [0, 13], hangingAfter: 13 });
  });
});

describe('hanging pot carried over several rounds', () => {
  /** chain rounds through computeRoundScore + checkMatchWinner like game.ts does */
  function chain(start: [number, number], rounds: Partial<ScoreInput>[]) {
    let score: [number, number] = [...start];
    let hanging = 0;
    const out: { outcome: string; score: [number, number]; hanging: number; winner: 0 | 1 | null }[] = [];
    for (const r of rounds) {
      const res = computeRoundScore(inp({ trickPoints: [81, 81], ...r, hangingBefore: hanging }));
      score = [score[0] + res.recorded[0], score[1] + res.recorded[1]];
      hanging = res.hangingAfter;
      out.push({ outcome: res.outcome, score, hanging, winner: checkMatchWinner(score, { outcome: res.outcome, capoTeam: r.capoTeam ?? null, hangingAfter: res.hangingAfter }) });
    }
    return out;
  }
  it('hanging → hanging → made: the pot accumulates and goes to the declarers of the decided round', () => {
    const r = chain([0, 0], [{ declarerTeam: 0 }, { declarerTeam: 1 }, { declarerTeam: 1, trickPoints: [62, 100] }]);
    expect(r.map((x) => x.outcome)).toEqual(['hanging', 'hanging', 'made']);
    expect(r.map((x) => x.hanging)).toEqual([8, 16, 0]);
    expect(r.map((x) => x.score)).toEqual([[0, 8], [8, 8], [14, 8 + 10 + 16]]);
  });
  it('hanging → failed: the pot goes to the defenders together with everything', () => {
    const r = chain([0, 0], [{ declarerTeam: 0 }, { declarerTeam: 0, trickPoints: [60, 102] }]);
    expect(r.at(-1)).toMatchObject({ outcome: 'failed', score: [0, 8 + 16 + 8], hanging: 0 });
  });
  it('contra hanging (everything ×2 hangs) → plain made next round', () => {
    const r = chain([0, 0], [{ multiplier: 2 }, { trickPoints: [100, 62] }]);
    expect(r.map((x) => x.hanging)).toEqual([32, 0]);
    expect(r.at(-1)!.score).toEqual([10 + 32, 6]);
  });
  it('defenders crossing 151 on a hanging round do not win; the next decided round finishes it', () => {
    const r = chain([100, 145], [{ declarerTeam: 0 }, { declarerTeam: 0, trickPoints: [100, 62] }]);
    expect(r[0]).toMatchObject({ outcome: 'hanging', score: [100, 153], winner: null, hanging: 8 });
    // declarers make it and collect the pot: 100 + 10 + 8 = 118 vs 153 + 6 = 159 → team 1 wins now
    expect(r[1]).toMatchObject({ outcome: 'made', score: [118, 159], winner: 1, hanging: 0 });
  });
  it('the awarded pot itself can carry a team over 151 on the resolving round', () => {
    const r = chain([140, 100], [{ declarerTeam: 1 }, { declarerTeam: 0, trickPoints: [90, 72] }]);
    expect(r[0]).toMatchObject({ outcome: 'hanging', score: [148, 100], winner: null });
    expect(r[1]).toMatchObject({ score: [148 + 9 + 8, 107], winner: 0 });
  });
  it('a capo on the resolving round still cannot finish', () => {
    const r = chain([140, 100], [{ declarerTeam: 1 }, { declarerTeam: 0, trickPoints: [162, 0], capoTeam: 0 }]);
    expect(r[1]).toMatchObject({ score: [148 + 25 + 8, 100], winner: null });
  });
});
