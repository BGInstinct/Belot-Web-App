/**
 * SHARED CONTRACT — public engine API. Signatures are fixed; the engine agent implements the bodies
 * (in separate modules re-exported from here). Server & client import only from '@belot/engine'.
 */
import type {
  Announcement,
  Bid,
  Card,
  Contract,
  GameAction,
  GameEvent,
  MatchState,
  PlayerView,
  RoomSettings,
  ScoreInput,
  ScoreOutput,
  Seat,
} from './types';
import * as ann from './announcements';
import * as bot from './autoplay';
import * as game from './game';
import * as scoring from './scoring';
import * as view from './view';

export * from './types';

/** Create a match and deal the first round (5 cards each, dealer given). rng defaults to Math.random. */
export function createMatch(settings: RoomSettings, dealer: Seat, rng?: () => number): MatchState {
  return game.createMatch(settings, dealer, rng);
}

/** Pure: returns a NEW state. Throws EngineError on illegal input. */
export function applyAction(
  state: MatchState,
  seat: Seat,
  action: GameAction,
): { state: MatchState; events: GameEvent[] } {
  return game.applyAction(state, seat, action);
}

/** From phase 'roundEnd': rotate dealer, shuffle, deal next round. */
export function startNextRound(state: MatchState, rng?: () => number): MatchState {
  return game.startNextRound(state, rng);
}

export function getLegalCards(state: MatchState, seat: Seat): Card[] {
  return game.getLegalCards(state, seat);
}

export function getLegalBids(state: MatchState, seat: Seat): Bid[] {
  return game.getLegalBids(state, seat);
}

export function getPlayerView(state: MatchState, seat: Seat | null): PlayerView {
  return view.getPlayerView(state, seat);
}

/** All combinations present in a hand for the given contract (none in NT). Excludes belot. */
export function detectAnnouncements(hand: Card[], contract: Contract): Announcement[] {
  return ann.detectAnnouncements(hand, contract);
}

/**
 * Action for a bot or a timed-out/AFK seat, at `state.settings.botDifficulty`.
 * FOG OF WAR: implementations must only see `getPlayerView(state, seat)` (own hand + public info) —
 * they delegate to `chooseBotAction`. NEVER returns `{ type: 'claim' }` (Claim All is human-only).
 */
export function chooseAutoAction(state: MatchState, seat: Seat): GameAction {
  return bot.chooseAutoAction(state, seat);
}

/** Round scoring math (division by 10, rounding, contra/recontra, hanging, capo). Used by the tracker too. */
export function computeRoundScore(input: ScoreInput): ScoreOutput {
  return scoring.computeRoundScore(input);
}

/**
 * Whether a team has won after a round, honouring 151+ and the "capo / all-pass cannot finish" rule.
 * A round that leaves points hanging (`hangingAfter > 0`) cannot finish the match either.
 */
export function checkMatchWinner(
  score: [number, number],
  lastRound: { outcome: string; capoTeam: 0 | 1 | null; hangingAfter?: number },
): 0 | 1 | null {
  return scoring.checkMatchWinner(score, lastRound);
}

export { cardId, sameCard, SUITS, RANKS } from './cards';

// Extra helpers (additive, optional to use)
export { seededRng, cardPoints, isTrump, strength } from './cards';
export { bestAnnouncementSet, canDeclareBelot } from './announcements';
export { contractRank } from './bidding';
export { WIN_THRESHOLD } from './scoring';
export { isClaimGuaranteed } from './claim';
export { chooseBotAction, type BotView } from './bot/index';

export * from './protocol';
