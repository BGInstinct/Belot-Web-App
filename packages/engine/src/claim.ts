import { isTrump, SUITS, teamOf } from './cards';
import type { Card, Contract, MatchState, Rank, Seat, Team } from './types';

/**
 * Claim All verification: exhaustive AND/OR search over the actual hands from the current position.
 * The claiming team (both partners) chooses its cards; the opponents may answer with ANY legal card.
 * Success iff the claiming team wins every remaining trick (incl. the one in progress) on every line.
 *
 * Implementation (fast, allocation-free inner loop):
 *  - cards are bits 0..31: suit*8 + strength position within the suit under the contract, so "higher in
 *    suit" is a bit range; hands are four 32-bit masks;
 *  - legality is a bitmask transcription of rules.ts `legalCardsFor` (strict and relaxed); a test
 *    cross-checks it against the real function on random positions;
 *  - only trick-taking matters (not points), so cards of one hand that are adjacent in a suit among the
 *    cards still in play are equivalent — only one of them is tried;
 *  - the claiming team's nodes stop at the first winning card, the opponents' at the first refutation
 *    (boolean alpha-beta), strongest cards first; positions at trick boundaries are memoised by
 *    (remaining-card mask, leader).
 */

const TRUMP_ORDER: readonly Rank[] = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];
const PLAIN_ORDER: readonly Rank[] = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'];

export class ClaimSearchBudgetExceeded extends Error {}

const suitMask = (s: number) => (0xff << (s * 8)) | 0;
/** bits strictly above bit i within i's suit */
function aboveInSuit(i: number): number {
  const n = i + 1;
  const low = n >= 32 ? -1 : (1 << n) - 1; // bits 0..i
  return suitMask(i >> 3) & ~low;
}

interface Ctx {
  trump: number; // suit index of the trump in a suit game, -1 otherwise
  allTrump: boolean;
  strict: boolean;
  team: Team;
  memo: Map<number, boolean>;
  nodes: number;
  budget: number;
  hands: number[];
  // current trick
  leader: number;
  plays: number[]; // card bits in play order (seat = (leader + i) % 4)
}

function teamOfSeat(s: number) {
  return s & 1;
}

/** index into plays of the play currently holding the trick */
function winningIdx(ctx: Ctx): number {
  let best = 0;
  for (let i = 1; i < ctx.plays.length; i++) {
    const a = ctx.plays[i];
    const b = ctx.plays[best];
    if (a >> 3 === b >> 3) {
      if (a > b) best = i;
    } else if (ctx.trump >= 0 && a >> 3 === ctx.trump) best = i;
  }
  return best;
}

/** Bitmask transcription of rules.ts legalCardsFor. */
function legalMask(ctx: Ctx, seat: number): number {
  const hand = ctx.hands[seat];
  const plays = ctx.plays;
  if (plays.length === 0) return hand;
  const led = plays[0] >> 3;
  const follow = hand & suitMask(led);
  if (follow !== 0) {
    if (ctx.strict && (ctx.allTrump || led === ctx.trump)) {
      let highest = -1;
      for (const p of plays) if (p >> 3 === led && p > highest) highest = p;
      const higher = follow & aboveInSuit(highest);
      if (higher !== 0) return higher;
    }
    return follow;
  }
  if (ctx.trump < 0) return hand;
  const winnerSeat = (ctx.leader + winningIdx(ctx)) % 4;
  if (teamOfSeat(winnerSeat) === teamOfSeat(seat)) return hand;
  const trumps = hand & suitMask(ctx.trump);
  if (trumps === 0) return hand;
  if (!ctx.strict) return trumps;
  let highest = -1;
  for (const p of plays) if (p >> 3 === ctx.trump && p > highest) highest = p;
  if (highest >= 0) {
    const higher = trumps & aboveInSuit(highest);
    return higher !== 0 ? higher : hand;
  }
  return trumps;
}

/** Candidate cards (strongest first, trumps first), one representative per equivalence class. */
function candidates(ctx: Ctx, seat: number, legal: number): number[] {
  let inPlay = ctx.hands[0] | ctx.hands[1] | ctx.hands[2] | ctx.hands[3];
  for (const p of ctx.plays) inPlay |= 1 << p;
  const out: number[] = [];
  const suits = [0, 1, 2, 3];
  if (ctx.trump >= 0) suits.sort((a, b) => (a === ctx.trump ? -1 : b === ctx.trump ? 1 : 0));
  for (const s of suits) {
    if ((legal & suitMask(s)) === 0) continue;
    // walk the suit from the top; skip a card when the next lower in-play card is also ours & legal
    for (let b = s * 8 + 7; b >= s * 8; b--) {
      if (((legal >>> b) & 1) === 0) continue;
      out.push(b);
      // skip the run of equivalent cards below b
      let c = b - 1;
      while (c >= s * 8) {
        if (((inPlay >>> c) & 1) === 0) {
          c--;
          continue;
        }
        if (((legal >>> c) & 1) === 1) {
          b = c; // c is equivalent to the pushed card → skip it (loop's b-- continues below it)
          c--;
          continue;
        }
        break;
      }
    }
  }
  return out;
}

function tryCard(ctx: Ctx, seat: number, bit: number): boolean {
  ctx.hands[seat] &= ~(1 << bit);
  ctx.plays.push(bit);
  let res: boolean;
  if (ctx.plays.length === 4) {
    const winner = (ctx.leader + winningIdx(ctx)) % 4;
    if (teamOfSeat(winner) !== ctx.team) res = false;
    else if ((ctx.hands[0] | ctx.hands[1] | ctx.hands[2] | ctx.hands[3]) === 0) res = true;
    else {
      const savedLeader = ctx.leader;
      const savedPlays = ctx.plays;
      ctx.leader = winner;
      ctx.plays = [];
      res = search(ctx);
      ctx.leader = savedLeader;
      ctx.plays = savedPlays;
    }
  } else res = search(ctx);
  ctx.plays.pop();
  ctx.hands[seat] |= 1 << bit;
  return res;
}

function search(ctx: Ctx): boolean {
  if (++ctx.nodes > ctx.budget) throw new ClaimSearchBudgetExceeded();
  const boundary = ctx.plays.length === 0;
  let key = 0;
  if (boundary) {
    key = ((ctx.hands[0] | ctx.hands[1] | ctx.hands[2] | ctx.hands[3]) >>> 0) * 4 + ctx.leader;
    const hit = ctx.memo.get(key);
    if (hit !== undefined) return hit;
  }
  const seat = (ctx.leader + ctx.plays.length) % 4;
  const ours = teamOfSeat(seat) === ctx.team;
  let res = !ours;
  for (const bit of candidates(ctx, seat, legalMask(ctx, seat))) {
    const r = tryCard(ctx, seat, bit);
    if (ours === r) {
      res = r;
      break;
    }
  }
  if (boundary) ctx.memo.set(key, res);
  return res;
}

export interface ClaimSolver {
  /** can the claiming team force all remaining tricks from this position? */
  canForce(state: MatchState, budget?: number): boolean;
  /** a card for the (claiming-team) seat on turn that keeps the forced win, or null if none */
  winningCard(state: MatchState): Card | null;
  nodes(): number;
}

/** One solver per deal & claiming team (the memo is only valid for those). */
export function createClaimSolver(state: MatchState, team: Team): ClaimSolver {
  const contract = state.contract!;
  const trump = contract.kind === 'suit' ? SUITS.indexOf(contract.suit) : -1;
  const toBit = (c: Card) => {
    const order = isTrump(c, contract) ? TRUMP_ORDER : PLAIN_ORDER;
    return SUITS.indexOf(c.suit) * 8 + order.indexOf(c.rank);
  };
  const fromBit = (b: number): Card => {
    const suit = SUITS[b >> 3];
    const order = contract.kind === 'AT' || (b >> 3) === trump ? TRUMP_ORDER : PLAIN_ORDER;
    return { suit, rank: order[b & 7] };
  };
  const ctx: Ctx = {
    trump,
    allTrump: contract.kind === 'AT',
    strict: state.settings.forceHigherCardPlacement,
    team,
    memo: new Map(),
    nodes: 0,
    budget: Infinity,
    hands: [0, 0, 0, 0],
    leader: 0,
    plays: [],
  };
  const load = (st: MatchState) => {
    ctx.hands = st.hands.map((h) => h.reduce((m, c) => m | (1 << toBit(c)), 0));
    const t = st.currentTrick;
    ctx.leader = t && t.plays.length ? t.leader : st.turn!;
    ctx.plays = t ? t.plays.map((p) => toBit(p.card)) : [];
  };
  const usable = (st: MatchState) =>
    st.phase === 'playing' && st.turn !== null && !!st.contract && st.hands.some((h) => h.length > 0);
  return {
    canForce(st, budget = Infinity) {
      if (!usable(st)) return false;
      load(st);
      ctx.budget = ctx.nodes + budget;
      try {
        return search(ctx);
      } finally {
        ctx.budget = Infinity;
      }
    },
    winningCard(st) {
      if (!usable(st) || teamOf(st.turn!) !== team) return null;
      load(st);
      const seat = st.turn!;
      for (const bit of candidates(ctx, seat, legalMask(ctx, seat))) if (tryCard(ctx, seat, bit)) return fromBit(bit);
      return null;
    },
    nodes: () => ctx.nodes,
  };
}

/**
 * Identity of the deal being played (who was dealt which card) + everything the search depends on. The
 * memo of a solver is valid for every position of the same round, so solvers are cached per deal.
 */
function dealKey(state: MatchState, team: Team): string {
  const c = state.contract!;
  const owned = state.hands.map((h) => h.map((x) => x.suit + x.rank));
  const played = [...state.tricks, ...(state.currentTrick ? [state.currentTrick] : [])];
  for (const t of played) for (const p of t.plays) owned[p.seat].push(p.card.suit + p.card.rank);
  const cs = c.kind === 'suit' ? c.suit : c.kind;
  return `${team}|${cs}|${state.settings.forceHigherCardPlacement ? 1 : 0}|${owned.map((o) => o.sort().join('')).join('/')}`;
}

const SOLVER_CACHE_SIZE = 8;
const solverCache = new Map<string, ClaimSolver>();

/** Solver for this deal & team, shared across calls (small LRU). */
export function solverFor(state: MatchState, team: Team): ClaimSolver {
  const key = dealKey(state, team);
  let s = solverCache.get(key);
  if (s) {
    solverCache.delete(key);
  } else {
    s = createClaimSolver(state, team);
    if (solverCache.size >= SOLVER_CACHE_SIZE) solverCache.delete(solverCache.keys().next().value!);
  }
  solverCache.set(key, s);
  return s;
}

/** Exact: would a Claim All by `seat`'s team succeed right now? (false outside the 'playing' phase) */
export function isClaimGuaranteed(state: MatchState, seat: Seat): boolean {
  if (state.phase !== 'playing' || !state.contract) return false;
  return solverFor(state, teamOf(seat)).canForce(state);
}

/**
 * Budgeted variant for bots: returns false when the search would exceed `budget` nodes (conservative —
 * a bot never makes a claim the engine might reject).
 */
export function isClaimGuaranteedWithin(state: MatchState, seat: Seat, budget: number): boolean {
  if (state.phase !== 'playing' || !state.contract) return false;
  try {
    return solverFor(state, teamOf(seat)).canForce(state, budget);
  } catch (e) {
    if (e instanceof ClaimSearchBudgetExceeded) return false;
    throw e;
  }
}

/** Test hook: the bitmask legality, as cards, for cross-checking against rules.ts. */
export function _legalViaMask(state: MatchState, seat: Seat): Card[] {
  const contract = state.contract!;
  const trump = contract.kind === 'suit' ? SUITS.indexOf(contract.suit) : -1;
  const toBit = (c: Card) => SUITS.indexOf(c.suit) * 8 + (isTrump(c, contract) ? TRUMP_ORDER : PLAIN_ORDER).indexOf(c.rank);
  const ctx: Ctx = {
    trump,
    allTrump: contract.kind === 'AT',
    strict: state.settings.forceHigherCardPlacement,
    team: 0,
    memo: new Map(),
    nodes: 0,
    budget: Infinity,
    hands: state.hands.map((h) => h.reduce((m, c) => m | (1 << toBit(c)), 0)),
    leader: state.currentTrick?.plays.length ? state.currentTrick.leader : seat,
    plays: state.currentTrick?.plays.map((p) => toBit(p.card)) ?? [],
  };
  const m = legalMask(ctx, seat);
  return state.hands[seat].filter((c) => ((m >>> toBit(c)) & 1) === 1);
}
