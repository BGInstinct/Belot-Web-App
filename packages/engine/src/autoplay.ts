/**
 * Auto-play for bots and timed-out / AFK seats. A thin wrapper: the decision is made by `chooseBotAction` from
 * the seat's PlayerView only (fog of war), seeded deterministically from that same public view.
 * Never returns a claim.
 */
import { chooseBotAction, viewSeed } from './bot/index';
import { seededRng } from './cards';
import type { GameAction, MatchState, Seat } from './types';
import { getPlayerView } from './view';

export function chooseAutoAction(state: MatchState, seat: Seat): GameAction {
  const view = getPlayerView(state, seat);
  return chooseBotAction(view, view.settings.botDifficulty ?? 'medium', seededRng(viewSeed(view)));
}
