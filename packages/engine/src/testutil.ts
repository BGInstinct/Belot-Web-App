import { beats, cardPoints, currentWinningPlay, isTrump, strength, teamOf } from './cards';
import { applyAction, createMatch, getLegalCards, startNextRound } from './game';
import { chooseBotAction, viewSeed } from './bot/index';
import { seededRng } from './cards';
import { getPlayerView } from './view';
import { isClaimGuaranteed } from './claim';
import type { BotDifficulty, Card, Contract, GameAction, MatchState, RoomSettings, Seat, Trick } from './types';
import { DEFAULT_SETTINGS } from './types';

/** Parse "JH 9H AS 10C" → cards. */
export function cards(s: string): Card[] {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ({ rank: t.slice(0, -1) as Card['rank'], suit: t.slice(-1) as Card['suit'] }));
}
export const c = (s: string): Card => cards(s)[0];

export function trick(leader: Seat, s: string): Trick {
  const cs = cards(s);
  return { leader, plays: cs.map((card, i) => ({ seat: ((leader + i) % 4) as Seat, card })) };
}

export function playingState(opts: {
  contract: Contract;
  hands: [string, string, string, string];
  declarer?: Seat;
  turn?: Seat;
  trick?: Trick | null;
  settings?: Partial<RoomSettings>;
  dealer?: Seat;
}): MatchState {
  const dealer = opts.dealer ?? 3;
  const leader = ((dealer + 1) % 4) as Seat;
  return {
    settings: { ...DEFAULT_SETTINGS, ...opts.settings },
    phase: 'playing',
    dealer,
    turn: opts.turn ?? leader,
    hands: opts.hands.map(cards) as MatchState['hands'],
    stock: [],
    bids: [],
    contract: opts.contract,
    declarer: opts.declarer ?? 0,
    multiplier: 1,
    tricks: [],
    currentTrick: opts.trick === undefined ? { leader, plays: [] } : opts.trick,
    declared: [],
    playedFirstCard: [],
    score: [0, 0],
    hanging: 0,
    roundHistory: [],
    roundNumber: 1,
    winner: null,
  };
}

export const ids = (cs: Card[]) => cs.map((x) => `${x.rank}${x.suit}`).sort();

/**
 * The engine's original (pre-difficulty) card-play heuristic, frozen for tests that replay specific stacked
 * deals. Auto-declaration mode only (the engine declares). Card choice uses only the seat's own hand and the trick.
 */
export function legacyPlay(state: MatchState, seat: Seat, opts: { claims?: boolean } = {}): GameAction {
  const contract = state.contract!;
  const remaining = 8 - state.tricks.length;
  // (the original bot also claimed guaranteed wins with 2..4 tricks left — test scripts only, never a bot)
  if (opts.claims && remaining >= 2 && remaining <= 4 && isClaimGuaranteed(state, seat)) return { type: 'claim' };
  const legal = getLegalCards(state, seat);
  const cheap = (x: Card) => (contract.kind === 'suit' && isTrump(x, contract) ? 1000 : 0) + cardPoints(x, contract) * 10 + strength(x, contract);
  const lowest = (cs: Card[]) => cs.reduce((a, b) => (cheap(b) < cheap(a) ? b : a));
  const highest = (cs: Card[]) => cs.reduce((a, b) => (strength(b, contract) > strength(a, contract) ? b : a));
  const play = (card: Card): GameAction => ({ type: 'play', card });
  if (legal.length === 1) return play(legal[0]);
  const trick = state.currentTrick;
  if (!trick || trick.plays.length === 0) {
    const tops = legal.filter((x) => (isTrump(x, contract) ? x.rank === 'J' : x.rank === 'A'));
    const declaring = state.declarer !== null && teamOf(state.declarer) === teamOf(seat);
    const trumpTops = tops.filter((x) => contract.kind === 'suit' && isTrump(x, contract));
    if (declaring && trumpTops.length) return play(trumpTops[0]);
    const plainTops = tops.filter((x) => !(contract.kind === 'suit' && isTrump(x, contract)));
    if (plainTops.length) return play(plainTops[0]);
    return play(lowest(legal));
  }
  const win = currentWinningPlay(trick, contract);
  if (teamOf(win.seat) === teamOf(seat)) return play(lowest(legal));
  const winning = legal.filter((x) => beats(x, win.card, contract));
  if (winning.length) {
    if (trick.plays.length === 3) return play(winning.reduce((a, b) => (strength(b, contract) < strength(a, contract) ? b : a)));
    const plain = winning.filter((x) => !(contract.kind === 'suit' && isTrump(x, contract)));
    return play(highest(plain.length ? plain : winning));
  }
  return play(lowest(legal));
}

export interface TournamentResult {
  matches: number;
  winsA: number;
  winRateA: number;
  rounds: number;
  /** average recorded points per round (all rounds incl. all-pass) */
  ptsPerRoundA: number;
  ptsPerRoundB: number;
}

/**
 * Bot tournament: difficulty A vs B, `matches` full matches to 151. Matches come in pairs on the same seed with
 * the teams swapped (A as team 0, then as team 1); dealer = seed % 4. Every decision goes through
 * chooseBotAction(getPlayerView(...)) seeded from the view, like the auto-player.
 */
export function tournament(a: BotDifficulty, b: BotDifficulty, matches: number, firstSeed = 1, settings: RoomSettings = DEFAULT_SETTINGS): TournamentResult {
  let winsA = 0;
  let rounds = 0;
  let ptsA = 0;
  let ptsB = 0;
  for (let m = 0; m < matches; m++) {
    const seed = firstSeed + Math.floor(m / 2);
    const aTeam = m % 2;
    const diff = [0, 1, 2, 3].map((s) => (s % 2 === aTeam ? a : b));
    const rng = seededRng(seed * 7919);
    let s = createMatch({ ...settings }, (seed % 4) as Seat, rng);
    let steps = 0;
    while (s.phase !== 'matchEnd') {
      if (++steps > 50_000) throw new Error('match did not terminate');
      if (s.phase === 'roundEnd') {
        s = startNextRound(s, rng);
        continue;
      }
      const seat = s.turn!;
      const v = getPlayerView(s, seat);
      s = applyAction(s, seat, chooseBotAction(v, diff[seat], seededRng(viewSeed(v)))).state;
    }
    for (const r of s.roundHistory) {
      rounds++;
      ptsA += r.recorded[aTeam];
      ptsB += r.recorded[1 - aTeam];
    }
    if (s.winner === aTeam) winsA++;
  }
  return { matches, winsA, winRateA: winsA / matches, rounds, ptsPerRoundA: ptsA / rounds, ptsPerRoundB: ptsB / rounds };
}
