import { bestAnnouncementSet, canDeclareBelot, makeBelot, resolveAnnouncements, validateAnnouncements } from './announcements';
import { biddingState, biddingStatus, legalBidsFor, sameBid } from './bidding';
import { cardPoints, currentWinningPlay, fullDeck, hasCard, nextSeat, removeCard, sameCard, shuffle, teamOf } from './cards';
import { legalCardsFor } from './rules';
import { checkMatchWinner, computeRoundScore } from './scoring';
import { solverFor } from './claim';
import {
  EngineError,
  type Announcement,
  type Bid,
  type Card,
  type ClaimInfo,
  type Contract,
  type GameAction,
  type GameEvent,
  type MatchState,
  type RoomSettings,
  type RoundResult,
  type Seat,
  type Team,
  type Trick,
} from './types';

type Hands = MatchState['hands'];

function cloneState(s: MatchState): MatchState {
  return JSON.parse(JSON.stringify(s)) as MatchState;
}

/** Shuffle and deal 3 then 2 cards to each player starting right of the dealer; 12 cards go to stock. */
function deal(dealer: Seat, rng: () => number): { hands: Hands; stock: Card[] } {
  const deck = shuffle(fullDeck(), rng);
  const hands: Hands = [[], [], [], []];
  let i = 0;
  for (const n of [3, 2]) {
    for (let k = 1; k <= 4; k++) {
      hands[nextSeat(dealer, k)].push(...deck.slice(i, i + n));
      i += n;
    }
  }
  return { hands, stock: deck.slice(i) };
}

function freshRound(base: Omit<MatchState, 'hands' | 'stock'>, rng: () => number): MatchState {
  const { hands, stock } = deal(base.dealer, rng);
  return { ...base, hands, stock };
}

export function createMatch(settings: RoomSettings, dealer: Seat, rng: () => number = Math.random): MatchState {
  return freshRound(
    {
      settings: { ...settings },
      phase: 'bidding',
      dealer,
      turn: nextSeat(dealer),
      bids: [],
      contract: null,
      declarer: null,
      multiplier: 1,
      tricks: [],
      currentTrick: null,
      declared: [],
      playedFirstCard: [],
      score: [0, 0],
      hanging: 0,
      roundHistory: [],
      roundNumber: 1,
      winner: null,
      claim: null,
    },
    rng,
  );
}

export function startNextRound(state: MatchState, rng: () => number = Math.random): MatchState {
  if (state.phase !== 'roundEnd') throw new EngineError('WRONG_PHASE', 'round is not over');
  const s = cloneState(state);
  const dealer = nextSeat(s.dealer);
  return freshRound(
    {
      ...s,
      phase: 'bidding',
      dealer,
      turn: nextSeat(dealer),
      bids: [],
      contract: null,
      declarer: null,
      multiplier: 1,
      tricks: [],
      currentTrick: null,
      declared: [],
      playedFirstCard: [],
      roundNumber: s.roundNumber + 1,
      claim: null,
    },
    rng,
  );
}

export function getLegalBids(state: MatchState, seat: Seat): Bid[] {
  if (state.phase !== 'bidding' || state.turn !== seat) return [];
  return legalBidsFor(state.bids, seat);
}

export function getLegalCards(state: MatchState, seat: Seat): Card[] {
  if (state.phase !== 'playing' || state.turn !== seat || !state.contract) return [];
  return legalCardsFor(state.hands[seat], state.currentTrick, state.contract, state.settings.forceHigherCardPlacement, seat);
}

export function applyAction(
  state: MatchState,
  seat: Seat,
  action: GameAction,
): { state: MatchState; events: GameEvent[] } {
  if (!action || (action.type !== 'bid' && action.type !== 'play' && action.type !== 'claim'))
    throw new EngineError('WRONG_PHASE', 'unknown action');
  if (action.type === 'bid') {
    if (state.phase !== 'bidding') throw new EngineError('WRONG_PHASE');
    if (state.turn !== seat) throw new EngineError('NOT_YOUR_TURN');
    return applyBid(state, seat, action.bid);
  }
  if (state.phase !== 'playing') throw new EngineError('WRONG_PHASE');
  if (state.turn !== seat) throw new EngineError('NOT_YOUR_TURN');
  if (action.type === 'claim') return applyClaim(state, seat);
  return applyPlay(state, seat, action);
}

/** Internal knobs for the claim play-out (never reachable through the public action). */
interface PlayOpts {
  /** overrides the winner of a completed trick (failed-claim penalty) */
  forceWinner?: (trick: Trick, actual: Seat) => Seat;
  /** skip auto announcements / belot for this play (auto mode) */
  noDeclare?: boolean;
}

/** Cheapest legal card: fewest points, weakest, trumps last in a suit game. */
function cheapest(cards: Card[], contract: Contract): Card {
  const key = (c: Card) =>
    (contract.kind === 'suit' && c.suit === contract.suit ? 1000 : 0) + cardPoints(c, contract) * 10 + RANK_ORDER.indexOf(c.rank);
  return cards.reduce((a, b) => (key(b) < key(a) ? b : a));
}
const RANK_ORDER = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'];

/**
 * Claim All. Verified by exhaustive search (see claim.ts). Success → remaining tricks are played out along a
 * winning line (opponents play their cheapest legal card). Failure → remaining cards are played out legally
 * (cheapest legal card) but every remaining trick (and last-10) is awarded to an opponent of the claimer;
 * the claiming team gets no new announcements/belot during the penalty play-out.
 * Both go through the normal play path so announcements, trick history and round scoring stay consistent.
 */
function applyClaim(state: MatchState, seat: Seat): { state: MatchState; events: GameEvent[] } {
  const contract = state.contract!;
  const team = teamOf(seat);
  const solver = solverFor(state, team);
  const success = solver.canForce(state);
  const claim: ClaimInfo = {
    seat,
    success,
    revealed: state.hands[seat].map((c) => ({ suit: c.suit, rank: c.rank })),
    tricksClaimed: 8 - state.tricks.length,
  };
  let s = cloneState(state);
  s.claim = claim;
  const startTricks = s.tricks.length;
  const events: GameEvent[] = [];
  const penaltySeat = nextSeat(seat);
  const opts: PlayOpts = success
    ? {}
    : { forceWinner: (_t, actual) => (teamOf(actual) === team ? penaltySeat : actual) };
  while (s.phase === 'playing') {
    const turn = s.turn!;
    const ours = teamOf(turn) === team;
    let card: Card;
    if (success && ours) card = solver.winningCard(s)!;
    else card = cheapest(getLegalCards(s, turn), contract);
    const suppress = !success && ours;
    const action: Extract<GameAction, { type: 'play' }> = { type: 'play', card };
    if (s.settings.manualAnnounceOnly && !suppress) {
      if (!s.playedFirstCard.includes(turn)) action.announcements = bestAnnouncementSet(s.hands[turn], contract);
      if (canDeclareBelot(s.hands[turn], card, contract, s.currentTrick)) action.belot = true;
    }
    const r = applyPlay(s, turn, action, { ...opts, noDeclare: suppress });
    s = r.state;
    events.push(...r.events);
  }
  const claimTricks = s.tricks.slice(startTricks);
  events.unshift({ type: 'claimed', claim, tricks: claimTricks });
  return { state: s, events };
}

function applyBid(state: MatchState, seat: Seat, bid: Bid): { state: MatchState; events: GameEvent[] } {
  if (!bid || !legalBidsFor(state.bids, seat).some((b) => sameBid(b, bid)))
    throw new EngineError('ILLEGAL_BID', `illegal bid ${JSON.stringify(bid)}`);
  const s = cloneState(state);
  const clean: Bid = bid.kind === 'contract' ? { kind: 'contract', contract: { ...bid.contract } } : { kind: bid.kind };
  s.bids.push({ seat, bid: clean });
  const st = biddingStatus(s.bids);
  s.contract = st.contract;
  s.declarer = st.bidder;
  s.multiplier = st.multiplier;
  const events: GameEvent[] = [{ type: 'bid', seat, bid: clean }];
  const status = biddingState(s.bids);
  if (status === 'open') {
    s.turn = nextSeat(seat);
    return { state: s, events };
  }
  events.push({ type: 'biddingEnded', contract: s.contract, declarer: s.declarer, multiplier: s.multiplier });
  if (status === 'allPass') {
    const result: RoundResult = {
      contract: null,
      declarerTeam: null,
      multiplier: 1,
      outcome: 'allPass',
      trickPoints: [0, 0],
      announcementPoints: [0, 0],
      capoTeam: null,
      recorded: [0, 0],
      hangingAfter: s.hanging,
    };
    s.roundHistory.push(result);
    s.phase = 'roundEnd';
    s.turn = null;
    events.push({ type: 'roundEnded', result });
    return { state: s, events };
  }
  // deal the remaining 3 cards each, starting right of the dealer
  for (let k = 1; k <= 4; k++) s.hands[nextSeat(s.dealer, k)].push(...s.stock.slice((k - 1) * 3, k * 3));
  s.stock = [];
  events.push({ type: 'dealtRest' });
  s.phase = 'playing';
  const leader = nextSeat(s.dealer);
  s.turn = leader;
  s.currentTrick = { leader, plays: [] };
  return { state: s, events };
}

function applyPlay(
  state: MatchState,
  seat: Seat,
  action: Extract<GameAction, { type: 'play' }>,
  opts: PlayOpts = {},
): { state: MatchState; events: GameEvent[] } {
  const contract = state.contract!;
  const hand = state.hands[seat];
  const card = action.card;
  if (!card || !hasCard(hand, card)) throw new EngineError('CARD_NOT_IN_HAND');
  const legal = getLegalCards(state, seat);
  if (!legal.some((c) => sameCard(c, card))) throw new EngineError('ILLEGAL_CARD');

  const manual = state.settings.manualAnnounceOnly;
  const first = !state.playedFirstCard.includes(seat);
  const trickBefore = state.currentTrick;
  const declaredNow: { seat: Seat; announcement: Announcement }[] = [];

  if (first && !opts.noDeclare) {
    if (manual) {
      const v = validateAnnouncements(hand, contract, action.announcements ?? []);
      if (!v) throw new EngineError('INVALID_ANNOUNCEMENT');
      v.forEach((a) => declaredNow.push({ seat, announcement: a }));
    } else {
      bestAnnouncementSet(hand, contract).forEach((a) => declaredNow.push({ seat, announcement: a }));
    }
  } else if (manual && action.announcements && action.announcements.length > 0) {
    throw new EngineError('INVALID_ANNOUNCEMENT', 'announcements only allowed with the first card');
  }

  const belotOk = canDeclareBelot(hand, card, contract, trickBefore);
  if (manual) {
    if (action.belot) {
      if (!belotOk) throw new EngineError('INVALID_ANNOUNCEMENT', 'belot not possible with this card');
      declaredNow.push({ seat, announcement: makeBelot(card.suit) });
    }
  } else if (belotOk && !opts.noDeclare) declaredNow.push({ seat, announcement: makeBelot(card.suit) });

  const s = cloneState(state);
  const events: GameEvent[] = [];
  s.hands[seat] = removeCard(s.hands[seat], card);
  if (first) s.playedFirstCard.push(seat);
  for (const d of declaredNow) {
    s.declared.push(d);
    events.push({ type: 'announced', seat, announcement: d.announcement });
  }
  const trick: Trick = s.currentTrick ?? { leader: seat, plays: [] };
  trick.plays.push({ seat, card: { suit: card.suit, rank: card.rank } });
  s.currentTrick = trick;
  events.push({ type: 'cardPlayed', seat, card: { suit: card.suit, rank: card.rank } });

  if (trick.plays.length < 4) {
    s.turn = nextSeat(seat);
    return { state: s, events };
  }
  const actual = currentWinningPlay(trick, contract).seat;
  const winner = opts.forceWinner ? opts.forceWinner(trick, actual) : actual;
  trick.winner = winner;
  s.tricks.push(trick);
  events.push({ type: 'trickWon', seat: winner, trick });
  if (s.tricks.length < 8) {
    s.currentTrick = { leader: winner, plays: [] };
    s.turn = winner;
    return { state: s, events };
  }
  s.currentTrick = null;
  s.turn = null;
  finishRound(s, events);
  return { state: s, events };
}

/** Score a completed round (mutates the already-cloned state). */
function finishRound(s: MatchState, events: GameEvent[]) {
  const contract = s.contract!;
  const declarerTeam = teamOf(s.declarer!);
  const trickPoints: [number, number] = [0, 0];
  const tricksWon: [number, number] = [0, 0];
  s.tricks.forEach((t, i) => {
    const team = teamOf(t.winner!);
    tricksWon[team]++;
    trickPoints[team] += t.plays.reduce((sum, p) => sum + cardPoints(p.card, contract), 0) + (i === 7 ? 10 : 0);
  });
  const capoTeam: Team | null = tricksWon[0] === 8 ? 0 : tricksWon[1] === 8 ? 1 : null;
  const { combos, belot } = resolveAnnouncements(s.declared);
  const score = computeRoundScore({
    contract,
    declarerTeam,
    multiplier: s.multiplier,
    trickPoints,
    announcementPoints: combos,
    belotPoints: belot,
    capoTeam,
    hangingBefore: s.hanging,
  });
  const result: RoundResult = {
    contract,
    declarerTeam,
    multiplier: s.multiplier,
    outcome: score.outcome,
    trickPoints: contract.kind === 'NT' ? [trickPoints[0] * 2, trickPoints[1] * 2] : trickPoints,
    announcementPoints: [combos[0] + belot[0], combos[1] + belot[1]],
    capoTeam,
    recorded: score.recorded,
    hangingAfter: score.hangingAfter,
    claim: s.claim ?? null,
  };
  s.score = [s.score[0] + score.recorded[0], s.score[1] + score.recorded[1]];
  s.hanging = score.hangingAfter;
  s.roundHistory.push(result);
  events.push({ type: 'roundEnded', result });
  const w = checkMatchWinner(s.score, result);
  if (w !== null) {
    s.winner = w;
    s.phase = 'matchEnd';
    events.push({ type: 'matchEnded', winner: w });
  } else s.phase = 'roundEnd';
}
