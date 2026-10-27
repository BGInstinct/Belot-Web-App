import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  EngineError,
  applyAction,
  cardId,
  createMatch,
  getLegalBids,
  getPlayerView,
  seededRng,
  startNextRound,
} from './index';
import { c, cards, legacyPlay, playingState } from './testutil';
import type { Bid, GameAction, MatchState, Seat } from './types';

const bid = (b: Bid): GameAction => ({ type: 'bid', bid: b });
const pass = bid({ kind: 'pass' });
const suitBid = (suit: 'C' | 'D' | 'H' | 'S') => bid({ kind: 'contract', contract: { kind: 'suit', suit } });
const contra = bid({ kind: 'contra' });
const recontra = bid({ kind: 'recontra' });

function run(state: MatchState, steps: [Seat, GameAction][]): MatchState {
  for (const [seat, a] of steps) state = applyAction(state, seat, a).state;
  return state;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
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

describe('createMatch / dealing', () => {
  it('deals 5 cards each, 12 in stock, all distinct, bidding starts right of dealer', () => {
    const s = createMatch(DEFAULT_SETTINGS, 2, seededRng(1));
    expect(s.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    expect(s.stock).toHaveLength(12);
    expect(new Set([...s.hands.flat(), ...s.stock].map(cardId)).size).toBe(32);
    expect(s.turn).toBe(3);
    expect(s.phase).toBe('bidding');
  });
  it('is deterministic with injected rng', () => {
    expect(createMatch(DEFAULT_SETTINGS, 0, seededRng(7))).toEqual(createMatch(DEFAULT_SETTINGS, 0, seededRng(7)));
  });
});

describe('bidding', () => {
  const s0 = createMatch(DEFAULT_SETTINGS, 3, seededRng(3)); // first bidder: seat 0
  it('legal bids initially: pass + all contracts', () => {
    expect(getLegalBids(s0, 0)).toHaveLength(7);
    expect(getLegalBids(s0, 1)).toEqual([]);
  });
  it('rejects out of turn and lower bids', () => {
    expectCode(() => applyAction(s0, 1, pass), 'NOT_YOUR_TURN');
    const s = run(s0, [[0, suitBid('H')]]);
    expectCode(() => applyAction(s, 1, suitBid('D')), 'ILLEGAL_BID');
    expectCode(() => applyAction(s, 1, suitBid('H')), 'ILLEGAL_BID');
    expectCode(() => applyAction(s, 1, recontra), 'ILLEGAL_BID');
    expectCode(() => applyAction(s0, 0, contra), 'ILLEGAL_BID');
    expectCode(() => applyAction(s0, 0, { type: 'play', card: c('7S') }), 'WRONG_PHASE');
  });
  it('contra only by opponents, recontra only by contra’d team', () => {
    const s = run(s0, [[0, suitBid('H')]]);
    expect(getLegalBids(s, 1).some((b) => b.kind === 'contra')).toBe(true);
    const s2 = run(s, [[1, pass]]);
    expect(getLegalBids(s2, 2).some((b) => b.kind === 'contra')).toBe(false); // partner
    const s3 = run(s2, [[2, pass], [3, contra]]);
    expect(s3.multiplier).toBe(2);
    expect(getLegalBids(s3, 0).some((b) => b.kind === 'recontra')).toBe(true);
    expect(getLegalBids(s3, 0).some((b) => b.kind === 'contra')).toBe(false);
    const s4 = run(s3, [[0, recontra]]);
    expect(s4.multiplier).toBe(4);
    expect(getLegalBids(s4, 1).filter((b) => b.kind === 'contra' || b.kind === 'recontra')).toEqual([]);
    // higher contract after recontra resets multiplier
    const s5 = run(s4, [[1, bid({ kind: 'contract', contract: { kind: 'NT' } })]]);
    expect(s5.multiplier).toBe(1);
    expect(s5.declarer).toBe(1);
    expect(s5.contract).toEqual({ kind: 'NT' });
  });
  it('ends after 3 passes following the last bid; deals the rest; dealer+1 leads', () => {
    const s = run(s0, [
      [0, suitBid('H')],
      [1, contra],
      [2, pass],
      [3, pass],
    ]);
    expect(s.phase).toBe('bidding');
    const r = applyAction(s, 0, pass);
    expect(r.state.phase).toBe('playing');
    expect(r.state.multiplier).toBe(2);
    expect(r.state.declarer).toBe(0);
    expect(r.state.hands.map((h) => h.length)).toEqual([8, 8, 8, 8]);
    expect(r.state.stock).toEqual([]);
    expect(r.state.turn).toBe(0);
    expect(r.events.map((e) => e.type)).toEqual(['bid', 'biddingEnded', 'dealtRest']);
  });
  it('all pass → allPass round, hanging kept, next dealer redeals', () => {
    const base = { ...s0, hanging: 7 };
    const s = run(base, [
      [0, pass],
      [1, pass],
      [2, pass],
      [3, pass],
    ]);
    expect(s.phase).toBe('roundEnd');
    expect(s.roundHistory[0].outcome).toBe('allPass');
    expect(s.roundHistory[0].hangingAfter).toBe(7);
    expect(s.hanging).toBe(7);
    const n = startNextRound(s, seededRng(4));
    expect(n.dealer).toBe(0);
    expect(n.turn).toBe(1);
    expect(n.roundNumber).toBe(2);
    expect(n.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
  });
  it('startNextRound only from roundEnd', () => {
    expectCode(() => startNextRound(s0), 'WRONG_PHASE');
  });
  it('does not mutate input', () => {
    const frozen = deepFreeze(createMatch(DEFAULT_SETTINGS, 3, seededRng(3)));
    const snap = JSON.stringify(frozen);
    run(frozen, [[0, suitBid('H')], [1, pass], [2, pass], [3, pass]]);
    expect(JSON.stringify(frozen)).toBe(snap);
  });
});

describe('playing', () => {
  const hands: [string, string, string, string] = [
    '7S 8S 9S QH KH AC 7D 8D',
    'AS 10S KS JH 9H 7C 8C 9C',
    'JS QS 7H 8H 10C JC QC KC',
    '10H AH AD 10D KD QD JD 9D',
  ];
  const H = { kind: 'suit', suit: 'H' } as const;
  it('rejects cards not in hand / illegal cards / out of turn', () => {
    const s = playingState({ contract: H, hands });
    expectCode(() => applyAction(s, 0, { type: 'play', card: c('AS') }), 'CARD_NOT_IN_HAND');
    expectCode(() => applyAction(s, 1, { type: 'play', card: c('AS') }), 'NOT_YOUR_TURN');
    const s1 = applyAction(s, 0, { type: 'play', card: c('7S') }).state;
    expectCode(() => applyAction(s1, 1, { type: 'play', card: c('JH') }), 'ILLEGAL_CARD');
  });
  it('auto mode: declares sequences on first card and belot on Q/K of trump', () => {
    const s = playingState({ contract: H, hands });
    const r = applyAction(s, 0, { type: 'play', card: c('QH') });
    const types = r.events.filter((e) => e.type === 'announced').map((e) => (e as any).announcement.type);
    expect(types.sort()).toEqual(['belot', 'tierce']);
    expect(r.state.playedFirstCard).toEqual([0]);
    // second Q/K card: no second belot
    const s2 = { ...r.state, turn: 0 as Seat, currentTrick: { leader: 0 as Seat, plays: [] } };
    const r2 = applyAction(s2, 0, { type: 'play', card: c('KH') });
    expect(r2.events.some((e) => e.type === 'announced')).toBe(false);
  });
  it('manual mode: nothing auto-declared; invalid declarations rejected', () => {
    const s = playingState({ contract: H, hands, settings: { manualAnnounceOnly: true } });
    const r = applyAction(s, 0, { type: 'play', card: c('QH') });
    expect(r.state.declared).toEqual([]);
    expectCode(
      () => applyAction(s, 0, { type: 'play', card: c('7S'), announcements: [{ type: 'quarte', cards: cards('7S 8S 9S'), points: 50, highRank: '9' }] }),
      'INVALID_ANNOUNCEMENT',
    );
    expectCode(() => applyAction(s, 0, { type: 'play', card: c('7S'), belot: true }), 'INVALID_ANNOUNCEMENT');
    const ok = applyAction(s, 0, {
      type: 'play',
      card: c('QH'),
      belot: true,
      announcements: [{ type: 'tierce', cards: cards('7S 8S 9S'), points: 20, highRank: '9' }],
    });
    expect(ok.state.declared.map((d) => d.announcement.type).sort()).toEqual(['belot', 'tierce']);
  });
  it('manual mode: announcements after the first card are rejected', () => {
    let s = playingState({ contract: H, hands, settings: { manualAnnounceOnly: true } });
    s = { ...s, playedFirstCard: [0] };
    expectCode(
      () => applyAction(s, 0, { type: 'play', card: c('7S'), announcements: [{ type: 'tierce', cards: cards('7S 8S 9S'), points: 20, highRank: '9' }] }),
      'INVALID_ANNOUNCEMENT',
    );
  });
  it('trick completes, winner leads next, view hides other hands', () => {
    let s = playingState({ contract: H, hands });
    s = run(s, [
      [0, { type: 'play', card: c('7S') }],
      [1, { type: 'play', card: c('AS') }],
      [2, { type: 'play', card: c('JS') }],
    ]);
    const r = applyAction(s, 3, { type: 'play', card: c('10H') });
    expect(r.state.tricks[0].winner).toBe(3);
    expect(r.state.turn).toBe(3);
    expect(r.events.some((e) => e.type === 'trickWon')).toBe(true);
    const v = getPlayerView(r.state, 3);
    expect(v.hand).toHaveLength(7);
    expect(v.handCounts).toEqual([7, 7, 7, 7]);
    expect(v.lastTrick?.winner).toBe(3);
    expect(v.tricksWon).toEqual([0, 1]);
    expect(v.legalCards).toHaveLength(7);
    expect(getPlayerView(r.state, 0).legalCards).toEqual([]);
    expect(getPlayerView(r.state, null).hand).toEqual([]);
    expect(JSON.stringify(getPlayerView(r.state, 0))).not.toContain('"stock":[{');
  });
  it('view lists available announcements for the first card', () => {
    const s = playingState({ contract: H, hands, settings: { manualAnnounceOnly: true } });
    expect(getPlayerView(s, 0).availableAnnouncements.map((a) => a.type)).toEqual(['tierce']);
    expect(getPlayerView(s, 1).availableAnnouncements).toEqual([]);
  });
  it('full scripted round: capo cannot finish the match', () => {
    // team 0 holds every trump and all aces → leads trumps then aces, takes all 8 tricks
    const capoHands: [string, string, string, string] = [
      'JH 9H AH 10H AS AD AC 10S',
      '7S 8S 9S 7D 8D 9D 7C 8C',
      'KH QH 8H 7H 10D 10C KS QS',
      'JS KD QD JD KC QC JC 9C',
    ];
    let s = playingState({ contract: H, hands: capoHands, dealer: 3 });
    s = { ...s, score: [150, 40] };
    const order = ['JH', '9H', 'AH', '10H', 'AS', 'AD', 'AC', '10S'];
    for (const lead of order) {
      s = applyAction(s, 0, { type: 'play', card: c(lead) }).state;
      for (const seat of [1, 2, 3] as Seat[]) {
        const legal = getPlayerView(s, seat).legalCards;
        s = applyAction(s, seat, { type: 'play', card: legal[0] }).state;
      }
    }
    const res = s.roundHistory[0];
    expect(res.capoTeam).toBe(0);
    expect(res.outcome).toBe('made');
    expect(res.announcementPoints[0]).toBeGreaterThanOrEqual(20); // at least seat 0’s tierce 9-10-J
    expect(s.score[0]).toBeGreaterThan(151);
    expect(s.phase).toBe('roundEnd');
    expect(s.winner).toBeNull();
  });
});

describe('hanging round cannot finish the match (stacked decks from seeded match 67, rounds 19–20)', () => {
  function playOut(s: MatchState): MatchState {
    // frozen legacy heuristic: these stacked deals reproduce match 67 as the original bot played it
    while (s.phase === 'playing') s = applyAction(s, s.turn!, legacyPlay(s, s.turn!, { claims: true })).state;
    return s;
  }
  it('defenders cross 151 on a hanging round → no winner; the next decided round resolves the pot and finishes', () => {
    let s = playingState({
      contract: { kind: 'suit', suit: 'S' },
      hands: ['10H 7H 7C QS QH KS KD AD', '9H KH 10C 9C 9S 9D JD 7D', 'JS 8D 10S 8H 8S 7S QD JC', '10D AC 8C KC AS JH QC AH'],
      declarer: 2,
      dealer: 1,
    });
    s.score = [107, 142];
    s = playOut(s);
    const r19 = s.roundHistory.at(-1)!;
    expect(r19.outcome).toBe('hanging');
    expect(r19.recorded[0]).toBe(0); // declarers (team 0) record nothing
    expect(s.score[1]).toBeGreaterThanOrEqual(151); // defenders crossed 151 …
    expect(s.phase).toBe('roundEnd'); // … but the match goes on
    expect(s.winner).toBeNull();
    expect(s.hanging).toBe(r19.hangingAfter);
    expect(s.hanging).toBeGreaterThan(0);

    // next round (AT, declarer seat 0): decided → pot awarded, match can finish
    const pot = s.hanging;
    const scoreBefore = [...s.score];
    let n = playingState({
      contract: { kind: 'AT' },
      hands: ['AD JC 7S AH JS KH QS AC', '7D 10H JH 8C 10S KD KC 8S', '10C 9H 9C 8H 10D AS JD 7C', 'QD 8D 9D KS QC 7H 9S QH'],
      declarer: 0,
      dealer: 2,
    });
    n = { ...n, score: s.score, hanging: s.hanging, roundHistory: s.roundHistory, roundNumber: 20 };
    n = playOut(n);
    const r20 = n.roundHistory.at(-1)!;
    expect(['made', 'failed']).toContain(r20.outcome);
    expect(r20.hangingAfter).toBe(0);
    const potTo = r20.outcome === 'made' ? 0 : 1;
    expect(r20.recorded[potTo]).toBeGreaterThanOrEqual(pot);
    expect(n.score).toEqual([scoreBefore[0] + r20.recorded[0], scoreBefore[1] + r20.recorded[1]]);
    expect(n.phase).toBe('matchEnd');
    expect(n.winner).toBe(n.score[0] > n.score[1] ? 0 : 1);
  });
});
