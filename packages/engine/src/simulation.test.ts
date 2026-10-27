import { describe, expect, it } from 'vitest';
import {
  applyAction,
  cardId,
  chooseAutoAction,
  createMatch,
  getLegalBids,
  getLegalCards,
  getPlayerView,
  seededRng,
  startNextRound,
} from './index';
import type { MatchState, RoomSettings, Seat } from './types';

function allCards(s: MatchState): string[] {
  return [
    ...s.hands.flat(),
    ...s.stock,
    ...s.tricks.flatMap((t) => t.plays.map((p) => p.card)),
    ...(s.currentTrick?.plays.map((p) => p.card) ?? []),
  ].map(cardId);
}

function playMatch(settings: RoomSettings, seed: number) {
  const rng = seededRng(seed);
  let s = createMatch(settings, (seed % 4) as Seat, rng);
  let steps = 0;
  while (s.phase !== 'matchEnd') {
    if (++steps > 20000) throw new Error('match did not terminate');
    if (s.phase === 'roundEnd') {
      s = startNextRound(s, rng);
      continue;
    }
    const seat = s.turn!;
    const action = chooseAutoAction(s, seat);
    // the bot only ever picks legal options
    if (action.type === 'bid') expect(getLegalBids(s, seat)).toContainEqual(action.bid);
    else if (action.type === 'play') expect(getLegalCards(s, seat).map(cardId)).toContain(cardId(action.card));
    const view = getPlayerView(s, seat);
    if (action.type === 'claim') expect(view.canClaim).toBe(true);
    if (action.type === 'play') expect(view.legalCards.map(cardId)).toContain(cardId(action.card));
    const prevHanging = s.hanging;
    s = applyAction(s, seat, action).state;
    const ids = allCards(s);
    expect(ids).toHaveLength(32);
    expect(new Set(ids).size).toBe(32);
    if ((s.phase === 'roundEnd' || s.phase === 'matchEnd') && s.roundHistory.length) {
      const r = s.roundHistory[s.roundHistory.length - 1];
      if (r.outcome !== 'allPass' && s.tricks.length === 8) {
        const base = r.contract!.kind === 'suit' ? 16 : 26;
        const ann = (r.announcementPoints[0] + r.announcementPoints[1]) / 10;
        const capo = r.capoTeam !== null ? 9 : 0;
        expect(r.recorded[0] + r.recorded[1] + r.hangingAfter - prevHanging).toBe((base + ann + capo) * r.multiplier);
        expect(r.trickPoints[0] + r.trickPoints[1]).toBe(r.contract!.kind === 'suit' ? 162 : r.contract!.kind === 'AT' ? 258 : 260);
      }
    }
  }
  const total = s.roundHistory.reduce((acc, r) => [acc[0] + r.recorded[0], acc[1] + r.recorded[1]], [0, 0]);
  expect(s.score).toEqual(total);
  expect(s.winner).not.toBeNull();
  expect(s.score[s.winner!]).toBeGreaterThanOrEqual(151);
  expect(s.score[s.winner!]).toBeGreaterThan(s.score[1 - s.winner!]);
  const last = s.roundHistory[s.roundHistory.length - 1];
  expect(last.capoTeam).toBeNull();
  expect(last.outcome).not.toBe('allPass');
  return s;
}

describe('full bot matches', () => {
  const variants: RoomSettings[] = [
    { forceHigherCardPlacement: true, manualAnnounceOnly: false, turnTimerSeconds: 30, botDifficulty: 'medium' },
    { forceHigherCardPlacement: false, manualAnnounceOnly: false, turnTimerSeconds: 30, botDifficulty: 'medium' },
    { forceHigherCardPlacement: true, manualAnnounceOnly: true, turnTimerSeconds: 30, botDifficulty: 'medium' },
    { forceHigherCardPlacement: false, manualAnnounceOnly: true, turnTimerSeconds: 30, botDifficulty: 'medium' },
  ];
  for (const [vi, settings] of variants.entries()) {
    it(`variant ${vi}: 25 seeded matches complete consistently`, () => {
      const outcomes = new Set<string>();
      for (let seed = 1; seed <= 25; seed++) {
        const s = playMatch(settings, seed * 101 + vi);
        s.roundHistory.forEach((r) => outcomes.add(r.outcome));
      }
      expect(outcomes.has('made')).toBe(true);
    }, 60_000);
  }
  it('auto and manual (bot declares) modes give identical matches for the same seed', () => {
    const a = playMatch(variants[0], 42);
    const b = playMatch(variants[2], 42);
    expect(b.score).toEqual(a.score);
  });
});
