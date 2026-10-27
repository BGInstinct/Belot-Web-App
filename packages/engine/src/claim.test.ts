import { describe, expect, it } from 'vitest';
import { _legalViaMask } from './claim';
import { currentWinningPlay, fullDeck, nextSeat, shuffle, teamOf } from './cards';
import {
  EngineError,
  applyAction,
  cardId,
  chooseAutoAction,
  getLegalCards,
  getPlayerView,
  isClaimGuaranteed,
  seededRng,
  startNextRound,
} from './index';
import { legalCardsFor } from './rules';
import { cards, ids, playingState } from './testutil';
import type { Card, Contract, GameEvent, MatchState, Seat, Team, Trick } from './types';

const CONTRACTS: Contract[] = [
  { kind: 'suit', suit: 'C' },
  { kind: 'suit', suit: 'D' },
  { kind: 'suit', suit: 'H' },
  { kind: 'suit', suit: 'S' },
  { kind: 'NT' },
  { kind: 'AT' },
];

/** Random playing position: random deal & contract, then `plays` random legal cards. */
function randomPosition(seed: number, plays: number, strict: boolean): MatchState {
  const rng = seededRng(seed);
  const deck = shuffle(fullDeck(), rng);
  const hands = [0, 1, 2, 3].map((i) => deck.slice(i * 8, i * 8 + 8));
  const contract = CONTRACTS[Math.floor(rng() * CONTRACTS.length)];
  let s = playingState({ contract, hands: ['7C', '7C', '7C', '7C'], declarer: Math.floor(rng() * 4) as Seat, settings: { forceHigherCardPlacement: strict } });
  s.hands = hands as MatchState['hands'];
  for (let i = 0; i < plays; i++) {
    const seat = s.turn!;
    const legal = getLegalCards(s, seat);
    s = applyAction(s, seat, { type: 'play', card: legal[Math.floor(rng() * legal.length)] }).state;
  }
  return s;
}

/** Plain reference search: legalCardsFor + Card objects, no memo, no equivalence pruning. */
function naiveForce(hands: Card[][], tr: Trick, contract: Contract, strict: boolean, team: Team): boolean {
  const seat = ((tr.leader + tr.plays.length) % 4) as Seat;
  const legal = legalCardsFor(hands[seat], tr, contract, strict, seat);
  const ours = teamOf(seat) === team;
  for (const card of legal) {
    const nh = hands.map((h, i) => (i === seat ? h.filter((c) => c !== card) : h));
    const nt: Trick = { leader: tr.leader, plays: [...tr.plays, { seat, card }] };
    let r: boolean;
    if (nt.plays.length === 4) {
      const w = currentWinningPlay(nt, contract).seat;
      if (teamOf(w) !== team) r = false;
      else if (nh.every((h) => h.length === 0)) r = true;
      else r = naiveForce(nh, { leader: w, plays: [] }, contract, strict, team);
    } else r = naiveForce(nh, nt, contract, strict, team);
    if (ours && r) return true;
    if (!ours && !r) return false;
  }
  return !ours;
}

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(EngineError);
    expect((e as EngineError).code).toBe(code);
    return;
  }
  throw new Error('expected EngineError ' + code);
}

describe('claim search internals', () => {
  it('bitmask legality equals rules.ts legalCardsFor on random positions', () => {
    for (let seed = 1; seed <= 400; seed++) {
      for (const strict of [true, false]) {
        const s = randomPosition(seed, seed % 30, strict);
        const seat = s.turn!;
        expect(ids(_legalViaMask(s, seat))).toEqual(ids(getLegalCards(s, seat)));
      }
    }
  });

  it('matches a plain exhaustive search on random endgames (both teams, both rule sets)', () => {
    let trues = 0;
    let total = 0;
    for (let seed = 1; seed <= 300; seed++) {
      for (const strict of [true, false]) {
        const s = randomPosition(seed * 7, 14 + (seed % 15), strict); // 2..4.5 tricks played → ≤ 6 remaining
        for (const team of [0, 1] as Team[]) {
          const expected = naiveForce(s.hands, s.currentTrick!, s.contract!, strict, team);
          expect(isClaimGuaranteed(s, team as Seat)).toBe(expected);
          total++;
          if (expected) trues++;
        }
      }
    }
    expect(trues).toBeGreaterThan(10);
    expect(total - trues).toBeGreaterThan(10);
  });

  it('matches the plain search on deeper positions (5–7 tricks remaining)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const strict = seed % 2 === 0;
      const s = randomPosition(seed * 31, 4 + (seed % 10), strict);
      for (const team of [0, 1] as Team[])
        expect(isClaimGuaranteed(s, team as Seat)).toBe(naiveForce(s.hands, s.currentTrick!, s.contract!, strict, team));
    }
  });

  it('is fast on full 8-trick positions (worst case logged)', () => {
    let worst = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = randomPosition(seed * 13, seed % 4, seed % 2 === 0);
      const t0 = performance.now();
      isClaimGuaranteed(s, s.turn!);
      worst = Math.max(worst, performance.now() - t0);
    }
    console.log(`claim check worst case over 300 random 8-trick positions: ${worst.toFixed(1)} ms`);
    expect(worst).toBeLessThan(1500);
  });
});

describe('Claim All action', () => {
  // Spades trump. Seat 0 holds the top trumps and all side aces → team 0 takes everything.
  const winning = () =>
    playingState({
      contract: { kind: 'suit', suit: 'S' },
      hands: ['JS 9S AS 10S AH AD AC KS', '7H 8H 9H 7D 8D 9D 7C 8C', 'QS 10H KH 10D KD 10C KC QH', '7S 8S JH QD JD QC JC 9C'],
      declarer: 0,
      turn: 0,
      trick: { leader: 0, plays: [] },
    });

  it('rejects claims off-turn or outside play', () => {
    const s = winning();
    expectCode(() => applyAction(s, 1, { type: 'claim' }), 'NOT_YOUR_TURN');
    expectCode(() => applyAction({ ...s, phase: 'bidding' }, 0, { type: 'claim' }), 'WRONG_PHASE');
    expectCode(() => applyAction({ ...s, phase: 'roundEnd', turn: null }, 0, { type: 'claim' }), 'WRONG_PHASE');
  });

  it('canClaim is true for the seat on turn whether or not the claim would succeed (no leak)', () => {
    const good = winning();
    const bad = { ...good, turn: 1 as Seat, currentTrick: { leader: 1 as Seat, plays: [] } };
    expect(isClaimGuaranteed(good, 0)).toBe(true);
    expect(isClaimGuaranteed(bad, 1)).toBe(false);
    expect(getPlayerView(good, 0).canClaim).toBe(true);
    expect(getPlayerView(bad, 1).canClaim).toBe(true);
    expect(getPlayerView(good, 1).canClaim).toBe(false);
    expect(getPlayerView(good, null).canClaim).toBe(false);
  });

  it('successful claim from the first trick: capo, consistent tricks, reveal, events', () => {
    const s = winning();
    const { state, events } = applyAction(s, 0, { type: 'claim' });
    expect(state.phase).toBe('roundEnd');
    expect(state.tricks).toHaveLength(8);
    expect(state.tricks.every((t) => teamOf(t.winner!) === 0)).toBe(true);
    // every trick is a legal, real trick
    for (const t of state.tricks) expect(currentWinningPlay(t, s.contract!).seat).toBe(t.winner);
    expect(state.claim).toEqual({ seat: 0, success: true, revealed: cards('JS 9S AS 10S AH AD AC KS'), tricksClaimed: 8 });
    const r = state.roundHistory.at(-1)!;
    expect(r.claim).toEqual(state.claim);
    expect(r.capoTeam).toBe(0);
    expect(r.outcome).toBe('made');
    expect(events[0].type).toBe('claimed');
    const claimed = events[0] as Extract<GameEvent, { type: 'claimed' }>;
    expect(claimed.tricks).toEqual(state.tricks);
    expect(events.filter((e) => e.type === 'trickWon')).toHaveLength(8);
    expect(events.at(-1)!.type).toBe('roundEnded');
    // belot (QS+KS split between partners → no belot); seat 0 announced nothing
    for (const seat of [0, 1, 2, 3, null] as (Seat | null)[]) {
      const v = getPlayerView(state, seat);
      expect(v.claim).toEqual(state.claim);
      expect(v.canClaim).toBe(false);
    }
    const next = startNextRound(state, seededRng(1));
    expect(next.claim).toBeNull();
    expect(getPlayerView(next, 2).claim).toBeNull();
  });

  it('successful claim mid-trick and mid-round keeps earlier tricks and declares belot in auto mode', () => {
    // Hearts trump; seat 2 has K+Q of hearts (belot) and the team holds every trump & top cards.
    let s = playingState({
      contract: { kind: 'suit', suit: 'H' },
      hands: ['JH 9H AH 10H AS AD AC 10S', '7S 8S 9S 7D 8D 9D 7C 8C', 'KH QH 10D KD 10C KC QS KS', '7H 8H JS QD JD QC JC 9C'],
      declarer: 0,
      turn: 1,
      trick: { leader: 1, plays: [] },
      dealer: 0,
    });
    s = applyAction(s, 1, { type: 'play', card: cards('7S')[0] }).state;
    expect(s.turn).toBe(2);
    expect(isClaimGuaranteed(s, 2)).toBe(true);
    const { state } = applyAction(s, 2, { type: 'claim' });
    expect(state.claim!.tricksClaimed).toBe(8);
    expect(state.tricks[0].plays[0]).toEqual({ seat: 1, card: cards('7S')[0] });
    expect(state.tricks.every((t) => teamOf(t.winner!) === 0)).toBe(true);
    expect(state.declared.some((d) => d.seat === 2 && d.announcement.type === 'belot')).toBe(true);
    expect(state.roundHistory.at(-1)!.capoTeam).toBe(0);
  });

  it('claim fails when the trick in progress is already lost → penalty: every remaining trick to opponents', () => {
    // NT. Seat 1 led AC, seat 2 (team 0) is on turn holding no clubs that beat it.
    let s = playingState({
      contract: { kind: 'NT' },
      hands: ['AS AD AH 10S 10D 10H KS KD', 'AC 7S 7D 7H 8S 8D 8H 9S', '7C KH QS QD QH JS JD JH', '8C 9C 10C KC QC JC 9D 9H'],
      declarer: 0,
      turn: 1,
      trick: { leader: 1, plays: [] },
      dealer: 0,
    });
    s = applyAction(s, 1, { type: 'play', card: cards('AC')[0] }).state;
    expect(isClaimGuaranteed(s, 2)).toBe(false);
    const { state, events } = applyAction(s, 2, { type: 'claim' });
    expect(state.claim).toMatchObject({ seat: 2, success: false, tricksClaimed: 8 });
    expect(state.claim!.revealed.map(cardId).sort()).toEqual(ids(cards('7C KH QS QD QH JS JD JH')));
    expect(state.tricks).toHaveLength(8);
    expect(state.tricks.every((t) => teamOf(t.winner!) === 1)).toBe(true);
    const r = state.roundHistory.at(-1)!;
    expect(r.trickPoints).toEqual([0, 260]);
    expect(r.capoTeam).toBe(1);
    expect(r.outcome).toBe('failed');
    expect(r.claim!.success).toBe(false);
    expect(events[0].type).toBe('claimed');
    // all 32 cards accounted for and every play legal-by-suit (follow suit honoured)
    expect(new Set(state.tricks.flatMap((t) => t.plays.map((p) => cardId(p.card)))).size).toBe(32);
  });

  it('failed claim later in the round: earlier tricks stay, the rest (and last 10) go to opponents', () => {
    // Suit game (clubs). Play out 3 tricks with the bot, then seat on turn claims although not guaranteed.
    for (let seed = 1; seed < 200; seed++) {
      let s = randomPosition(seed, 12, true);
      if (isClaimGuaranteed(s, s.turn!)) continue;
      const before = s.tricks.map((t) => t.winner);
      const claimer = s.turn!;
      const { state } = applyAction(s, claimer, { type: 'claim' });
      expect(state.tricks.slice(0, 3).map((t) => t.winner)).toEqual(before);
      expect(state.tricks.slice(3).every((t) => teamOf(t.winner!) !== teamOf(claimer))).toBe(true);
      const r = state.roundHistory.at(-1)!;
      const opp = (1 - teamOf(claimer)) as Team;
      expect(r.claim!.success).toBe(false);
      expect(r.claim!.tricksClaimed).toBe(5);
      // last 10 to opponents
      expect(teamOf(state.tricks[7].winner!)).toBe(opp);
      // no new belot/announcement for the claiming team during the penalty play-out
      const declaredAfter = state.declared.slice(s.declared.length);
      expect(declaredAfter.every((d) => teamOf(d.seat) === opp)).toBe(true);
      return;
    }
    throw new Error('no suitable position found');
  });

  it('a successful random claim yields only claimer-team trick winners from the claim on', () => {
    let found = 0;
    for (let seed = 1; seed < 400 && found < 20; seed++) {
      const s = randomPosition(seed, 4 + (seed % 20), seed % 2 === 0);
      const claimer = s.turn!;
      if (!isClaimGuaranteed(s, claimer)) continue;
      found++;
      const done = s.tricks.length;
      const { state } = applyAction(s, claimer, { type: 'claim' });
      expect(state.claim!.success).toBe(true);
      expect(state.tricks.slice(done).every((t) => teamOf(t.winner!) === teamOf(claimer))).toBe(true);
      for (const t of state.tricks) expect(currentWinningPlay(t, s.contract!).seat).toBe(t.winner);
    }
    expect(found).toBeGreaterThan(5);
  });

  it('auto-play never claims, even when a claim is guaranteed (Claim All is human-only)', () => {
    let mid = winning();
    for (let i = 0; i < 16; i++) mid = applyAction(mid, mid.turn!, { type: 'play', card: getLegalCards(mid, mid.turn!)[0] }).state;
    expect(isClaimGuaranteed(mid, mid.turn!)).toBe(true);
    for (const botDifficulty of ['easy', 'medium', 'hard'] as const) {
      expect(chooseAutoAction(winning(), 0).type).toBe('play');
      expect(chooseAutoAction({ ...mid, settings: { ...mid.settings, botDifficulty } }, mid.turn!).type).toBe('play');
    }
  });

  it('penalty play-out: the (re-assigned) trick winner leads the next trick', () => {
    const s = randomPosition(5, 0, true);
    const claimer = s.turn!;
    if (isClaimGuaranteed(s, claimer)) return;
    const { state } = applyAction(s, claimer, { type: 'claim' });
    for (let i = 1; i < 8; i++) expect(state.tricks[i].leader).toBe(state.tricks[i - 1].winner);
    expect(state.tricks.every((t) => t.winner === nextSeat(claimer) || teamOf(t.winner!) !== teamOf(claimer))).toBe(true);
  });
});
