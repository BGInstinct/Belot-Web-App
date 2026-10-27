/**
 * Full matches to 151 with exhaustive per-action / per-round invariant checks and a per-round log.
 * Seats are played by the auto-player (which never claims). Claim All coverage comes from a scripted
 * "human" in the harness that sometimes claims a won endgame (it reads the position perfectly — emulated with
 * the referee's isClaimGuaranteed, which is fine for a test harness) and occasionally claims recklessly
 * (exercising the failed-claim penalty).
 */
import { describe, expect, it } from 'vitest';
import { cardPoints, currentWinningPlay, teamOf } from './cards';
import {
  DEFAULT_SETTINGS,
  applyAction,
  cardId,
  checkMatchWinner,
  chooseAutoAction,
  createMatch,
  getLegalBids,
  getLegalCards,
  getPlayerView,
  isClaimGuaranteed,
  seededRng,
  startNextRound,
} from './index';
import { legalCardsFor } from './rules';
import type { Card, Contract, GameAction, MatchState, RoomSettings, RoundResult, Seat, Team } from './types';

/** The harness's scripted human: claims some won endgames, rarely claims blindly; otherwise auto-plays. */
function scriptedAction(s: MatchState, seat: Seat, rng: () => number): GameAction {
  if (s.phase === 'playing') {
    const remaining = 8 - s.tricks.length;
    if (remaining >= 2 && remaining <= 5 && rng() < 0.4 && isClaimGuaranteed(s, seat)) return { type: 'claim' };
    if (remaining >= 2 && rng() < 0.006) return { type: 'claim' }; // reckless: usually fails → penalty
  }
  const a = chooseAutoAction(s, seat);
  expect(a.type).not.toBe('claim'); // the auto-player itself never claims
  return a;
}

const contractName = (c: Contract | null) => (!c ? '-' : c.kind === 'suit' ? c.suit : c.kind);

function allCards(s: MatchState): string[] {
  return [
    ...s.hands.flat(),
    ...s.stock,
    ...s.tricks.flatMap((t) => t.plays.map((p) => p.card)),
    ...(s.currentTrick?.plays.map((p) => p.card) ?? []),
  ].map(cardId);
}

/** Every seat's view must agree with the authoritative state (no desync). */
function checkViews(s: MatchState) {
  const tricksWon: [number, number] = [0, 0];
  for (const t of s.tricks) tricksWon[teamOf(t.winner!)]++;
  for (const seat of [0, 1, 2, 3, null] as (Seat | null)[]) {
    const v = getPlayerView(s, seat);
    expect(v.phase).toBe(s.phase);
    expect(v.turn).toBe(s.turn);
    expect(v.hand.map(cardId)).toEqual(seat === null ? [] : s.hands[seat].map(cardId));
    expect(v.handCounts).toEqual(s.hands.map((h) => h.length));
    expect(v.tricksWon).toEqual(tricksWon);
    expect(v.score).toEqual(s.score);
    expect(v.hanging).toBe(s.hanging);
    expect(v.roundNumber).toBe(s.roundNumber);
    expect(v.roundHistory).toHaveLength(s.roundHistory.length);
    expect(v.currentTrick).toEqual(s.currentTrick);
    expect(v.lastTrick).toEqual(s.tricks.at(-1) ?? null);
    expect(v.claim ?? null).toEqual(s.claim ?? null);
    expect(v.winner).toBe(s.winner);
    const toAct = seat !== null && s.turn === seat;
    expect(v.canClaim).toBe(toAct && s.phase === 'playing');
    expect(v.legalCards.map(cardId)).toEqual(seat === null ? [] : getLegalCards(s, seat).map(cardId));
  }
}

interface Row {
  round: number;
  contract: string;
  declTeam: Team | null;
  mult: number;
  raw: [number, number];
  outcome: string;
  capo: Team | null;
  recorded: [number, number];
  hangingBefore: number;
  hangingAfter: number;
  claim: string;
  score: [number, number];
}

/** Round-end checks: replay legality, trick bookkeeping, scoring rules, hanging pot, finish rule. */
function checkRound(s: MatchState, dealt: Card[][], r: RoundResult, hangingBefore: number, scoreBefore: [number, number]) {
  expect(s.hanging).toBe(r.hangingAfter);
  expect(s.score).toEqual([scoreBefore[0] + r.recorded[0], scoreBefore[1] + r.recorded[1]]);
  // no finish on all-pass / capo / hanging; finish when the rule says so
  const expectedWinner = checkMatchWinner(s.score, r);
  if (r.outcome === 'allPass' || r.capoTeam !== null || r.hangingAfter > 0) expect(s.phase).toBe('roundEnd');
  if (expectedWinner === null) expect(s.phase).toBe('roundEnd');
  else {
    expect(s.phase).toBe('matchEnd');
    expect(s.winner).toBe(expectedWinner);
  }
  if (r.outcome === 'allPass') {
    expect(r.recorded).toEqual([0, 0]);
    expect(r.hangingAfter).toBe(hangingBefore);
    expect(s.tricks).toHaveLength(0);
    return;
  }
  const contract = r.contract!;
  const strict = s.settings.forceHigherCardPlacement;
  expect(s.tricks).toHaveLength(8);
  // replay the round from the dealt hands: legality, seat order, leaders, winners
  const hands = dealt.map((h) => h.slice());
  const claimFrom = r.claim ? 8 - r.claim.tricksClaimed : 8;
  const trickPts: [number, number] = [0, 0];
  let leader = ((s.dealer + 1) % 4) as Seat;
  s.tricks.forEach((t, i) => {
    expect(t.leader).toBe(leader);
    const partial = { leader: t.leader, plays: [] as { seat: Seat; card: Card }[] };
    t.plays.forEach((p, k) => {
      expect(p.seat).toBe((t.leader + k) % 4);
      const legal = legalCardsFor(hands[p.seat], partial, contract, strict, p.seat).map(cardId);
      expect(legal).toContain(cardId(p.card));
      hands[p.seat] = hands[p.seat].filter((c) => cardId(c) !== cardId(p.card));
      partial.plays.push(p);
    });
    const natural = currentWinningPlay(t, contract).seat;
    if (r.claim && i >= claimFrom) {
      if (r.claim.success) {
        expect(t.winner).toBe(natural);
        expect(teamOf(t.winner!)).toBe(teamOf(r.claim.seat));
      } else expect(teamOf(t.winner!)).not.toBe(teamOf(r.claim.seat));
    } else expect(t.winner).toBe(natural);
    trickPts[teamOf(t.winner!)] += t.plays.reduce((x, p) => x + cardPoints(p.card, contract), 0) + (i === 7 ? 10 : 0);
    leader = t.winner!;
  });
  expect(hands.every((h) => h.length === 0)).toBe(true);
  if (r.claim) {
    // revealed hand = claimer's cards from the claim on
    const fromClaim = s.tricks.flatMap((t, i) => (i >= claimFrom ? t.plays : [])).filter((p) => p.seat === r.claim!.seat);
    expect(r.claim.revealed.map(cardId).sort()).toEqual(fromClaim.map((p) => cardId(p.card)).sort());
  }
  const mult = contract.kind === 'NT' ? 2 : 1;
  expect(r.trickPoints).toEqual([trickPts[0] * mult, trickPts[1] * mult]);
  const tricksWon = [0, 1].map((tm) => s.tricks.filter((t) => teamOf(t.winner!) === tm).length);
  expect(r.capoTeam).toBe(tricksWon[0] === 8 ? 0 : tricksWon[1] === 8 ? 1 : null);
  // scoring rules
  const d = r.declarerTeam!;
  const o = (1 - d) as Team;
  const raw = [0, 1].map((tm) => r.trickPoints[tm] + r.announcementPoints[tm] + (r.capoTeam === tm ? 90 : 0));
  expect(r.outcome).toBe(raw[d] > raw[o] ? 'made' : raw[d] < raw[o] ? 'failed' : 'hanging');
  const base = contract.kind === 'suit' ? 16 : 26;
  const total = (base + (r.announcementPoints[0] + r.announcementPoints[1]) / 10 + (r.capoTeam !== null ? 9 : 0)) * r.multiplier;
  expect(r.recorded[0] + r.recorded[1] + r.hangingAfter - hangingBefore).toBe(total);
  if (r.outcome === 'made') {
    expect(r.hangingAfter).toBe(0);
    expect(r.recorded[d]).toBeGreaterThanOrEqual(hangingBefore);
    if (r.multiplier > 1) expect(r.recorded[o]).toBe(0);
    else expect(Math.abs(r.recorded[o] * 10 - raw[o])).toBeLessThanOrEqual(10);
  } else if (r.outcome === 'failed') {
    expect(r.hangingAfter).toBe(0);
    expect(r.recorded[d]).toBe(0);
    expect(r.recorded[o]).toBe(total + hangingBefore);
  } else {
    expect(r.recorded[d]).toBe(0);
    expect(r.hangingAfter).toBeGreaterThan(hangingBefore);
    if (r.multiplier > 1) expect(r.recorded).toEqual([0, 0]);
    else expect(Math.abs(r.recorded[o] * 10 - raw[o])).toBeLessThanOrEqual(10);
  }
}

interface MatchLog {
  rows: Row[];
  state: MatchState;
}

function runMatch(seed: number, settings: RoomSettings, opts: { views: boolean }): MatchLog {
  const rng = seededRng(seed);
  const human = seededRng(seed * 7 + 3);
  let s = createMatch(settings, (seed % 4) as Seat, rng);
  const rows: Row[] = [];
  let dealt: Card[][] = [];
  let hangingBefore = 0;
  let scoreBefore: [number, number] = [0, 0];
  let steps = 0;
  if (opts.views) checkViews(s);
  while (s.phase !== 'matchEnd') {
    if (++steps > 20000) throw new Error('match did not terminate');
    if (s.phase === 'roundEnd') {
      s = startNextRound(s, rng);
      expect(s.claim).toBeNull();
      hangingBefore = s.hanging;
      scoreBefore = [...s.score];
      if (opts.views) checkViews(s);
      continue;
    }
    const seat = s.turn!;
    const action = scriptedAction(s, seat, human);
    if (action.type === 'bid') expect(getLegalBids(s, seat)).toContainEqual(action.bid);
    else if (action.type === 'play') expect(getLegalCards(s, seat).map(cardId)).toContain(cardId(action.card));
    else expect(s.phase).toBe('playing');
    const wasBidding = s.phase === 'bidding';
    s = applyAction(s, seat, action).state;
    const ids = allCards(s);
    expect(ids).toHaveLength(32);
    expect(new Set(ids).size).toBe(32);
    if (wasBidding && s.phase === 'playing') dealt = s.hands.map((h) => h.slice());
    if (opts.views) checkViews(s);
    if (s.phase === 'roundEnd' || s.phase === 'matchEnd') {
      const r = s.roundHistory.at(-1)!;
      checkRound(s, dealt, r, hangingBefore, scoreBefore);
      expect(!!r.claim).toBe(action.type === 'claim');
      rows.push({
        round: s.roundNumber,
        contract: contractName(r.contract),
        declTeam: r.declarerTeam,
        mult: r.multiplier,
        raw: [r.trickPoints[0] + r.announcementPoints[0], r.trickPoints[1] + r.announcementPoints[1]],
        outcome: r.outcome,
        capo: r.capoTeam,
        recorded: r.recorded,
        hangingBefore,
        hangingAfter: r.hangingAfter,
        claim: r.claim ? `s${r.claim.seat}:${r.claim.success ? 'ok' : 'FAIL'}@${8 - r.claim.tricksClaimed}` : '',
        score: [...s.score],
      });
    }
  }
  const total = s.roundHistory.reduce((a, r) => [a[0] + r.recorded[0], a[1] + r.recorded[1]], [0, 0]);
  expect(s.score).toEqual(total);
  expect(s.winner).not.toBeNull();
  expect(s.score[s.winner!]).toBeGreaterThanOrEqual(151);
  expect(s.score[s.winner!]).toBeGreaterThan(s.score[1 - s.winner!]);
  const last = s.roundHistory.at(-1)!;
  expect(last.capoTeam).toBeNull();
  expect(last.outcome === 'made' || last.outcome === 'failed').toBe(true);
  expect(last.hangingAfter).toBe(0);
  return { rows, state: s };
}

function printLog(title: string, log: MatchLog) {
  const pad = (x: unknown, n: number) => String(x).padEnd(n);
  const lines = [
    title,
    `${pad('#', 3)}${pad('ctr', 4)}${pad('decl', 5)}${pad('x', 2)}${pad('raw', 10)}${pad('outcome', 8)}${pad('capo', 5)}${pad('recorded', 9)}${pad('hang', 8)}${pad('claim', 11)}score`,
    ...log.rows.map(
      (r) =>
        `${pad(r.round, 3)}${pad(r.contract, 4)}${pad(r.declTeam ?? '-', 5)}${pad(r.mult, 2)}${pad(r.raw.join('-'), 10)}${pad(r.outcome, 8)}${pad(r.capo ?? '', 5)}${pad(r.recorded.join('-'), 9)}${pad(`${r.hangingBefore}->${r.hangingAfter}`, 8)}${pad(r.claim, 11)}${r.score.join('-')}`,
    ),
    `winner: team ${log.state.winner}, final ${log.state.score.join('-')}`,
  ];
  console.log(lines.join('\n'));
}

// Seeds chosen (by scanning) so that the three matches together contain a hanging round (carried and later
// resolved), a failed contract, and successful and failed Claims All (made by the harness's scripted human —
// the auto-player never claims). See also claim.test.ts and scoring.test.ts for scripted cases.
const SHOWCASE_SEEDS = [14, 24, 61];

describe('three full matches to 151 (logged)', () => {
  const logs: MatchLog[] = [];
  for (const [i, seed] of SHOWCASE_SEEDS.entries()) {
    it(`match ${i + 1} (seed ${seed})`, () => {
      const log = runMatch(seed, DEFAULT_SETTINGS, { views: true });
      printLog(`=== match ${i + 1} (seed ${seed}) ===`, log);
      logs.push(log);
    }, 60_000);
  }
  it('together they contain a hanging round, a failed contract, a successful and a failed claim', () => {
    const rows = logs.flatMap((l) => l.rows);
    expect(rows.some((r) => r.outcome === 'hanging')).toBe(true);
    expect(rows.some((r) => r.outcome === 'failed')).toBe(true);
    expect(rows.some((r) => r.claim.includes('ok'))).toBe(true);
    expect(rows.some((r) => r.claim.includes('FAIL'))).toBe(true);
    // a hanging pot was carried into a later round and resolved there
    expect(rows.some((r) => r.hangingBefore > 0 && (r.outcome === 'made' || r.outcome === 'failed'))).toBe(true);
  });
});

describe('randomized batch: 140 matches, all invariants', () => {
  const variants: { settings: RoomSettings; matches: number }[] = [
    { settings: { ...DEFAULT_SETTINGS }, matches: 50 },
    { settings: { ...DEFAULT_SETTINGS, forceHigherCardPlacement: false, botDifficulty: 'easy' }, matches: 35 },
    { settings: { ...DEFAULT_SETTINGS, manualAnnounceOnly: true, botDifficulty: 'easy' }, matches: 35 },
    { settings: { ...DEFAULT_SETTINGS, forceHigherCardPlacement: false, manualAnnounceOnly: true, botDifficulty: 'hard' }, matches: 20 },
  ];
  for (const [vi, { settings, matches }] of variants.entries()) {
    it(`variant ${vi} (${settings.botDifficulty}): ${matches} matches`, () => {
      const stats = { rounds: 0, hanging: 0, failed: 0, claims: 0, failedClaims: 0, capo: 0, allPass: 0, hangingCarried: 0 };
      for (let k = 0; k < matches; k++) {
        const { rows } = runMatch(10_000 + vi * 1000 + k, settings, { views: k % 10 === 0 });
        for (const r of rows) {
          stats.rounds++;
          if (r.outcome === 'hanging') stats.hanging++;
          if (r.outcome === 'failed') stats.failed++;
          if (r.outcome === 'allPass') stats.allPass++;
          if (r.claim) stats.claims++;
          if (r.claim.includes('FAIL')) stats.failedClaims++;
          if (r.capo !== null) stats.capo++;
          if (r.hangingBefore > 0 && r.outcome !== 'allPass') stats.hangingCarried++;
        }
      }
      console.log(`variant ${vi}: ${JSON.stringify(stats)}`);
      expect(stats.claims).toBeGreaterThan(stats.failedClaims);
      expect(stats.failedClaims).toBeGreaterThan(0);
    }, 300_000);
  }
});
