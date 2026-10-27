/**
 * Bots. FOG OF WAR (anti-cheat), enforced structurally:
 *  - the only entry point, `chooseBotAction`, receives a `BotView` (= the seat's PlayerView: own hand + public
 *    information: trick history, current trick, bids, contract, declarer, declared announcements, score,
 *    legal cards/bids, settings) — never the MatchState;
 *  - nothing in bot/ imports game.ts, claim.ts, view.ts or the index, or touches MatchState
 *    (checked by bot.test.ts, which greps these sources);
 *  - bots never Claim All (that is a human-only, explicit action).
 */
import { bestAnnouncementSet, canDeclareBelot } from '../announcements';
import { sameBid } from '../bidding';
import { sameCard } from '../cards';
import type { Bid, BotDifficulty, Card, GameAction, PlayerView } from '../types';
import { easyBid, hardBid, mediumBid } from './bidding';
import { hardCard } from './hard';
import { easyCard, mediumCard } from './play';

/** What a seat may legally know — exactly its PlayerView. */
export type BotView = PlayerView;

const PASS: GameAction = { type: 'bid', bid: { kind: 'pass' } };

/**
 * Bot decision from public information only. Deterministic for a given rng. Never returns a claim.
 * Off-turn / outside bidding & play it returns a pass bid (as the engine always did).
 */
export function chooseBotAction(view: BotView, difficulty: BotDifficulty, rng: () => number = Math.random): GameAction {
  const diff: BotDifficulty = difficulty === 'easy' || difficulty === 'hard' ? difficulty : 'medium';
  if (view.seat === null || view.turn !== view.seat) return PASS;
  if (view.phase === 'bidding') {
    const bid: Bid = diff === 'easy' ? easyBid(view, rng) : diff === 'hard' ? hardBid(view) : mediumBid(view);
    const legal = view.legalBids.find((b) => sameBid(b, bid));
    return { type: 'bid', bid: legal ?? { kind: 'pass' } };
  }
  if (view.phase !== 'playing' || !view.contract || view.legalCards.length === 0) return PASS;
  let card: Card = diff === 'easy' ? easyCard(view, rng) : diff === 'hard' ? hardCard(view, rng) : mediumCard(view);
  if (!view.legalCards.some((c) => sameCard(c, card))) card = view.legalCards[0];
  card = { suit: card.suit, rank: card.rank };
  const action: Extract<GameAction, { type: 'play' }> = { type: 'play', card };
  const manual = view.settings.manualAnnounceOnly;
  // easy bots sometimes forget to declare in manual-announce mode
  const forgetAnn = manual && diff === 'easy' && rng() < 0.35;
  const forgetBelot = manual && diff === 'easy' && rng() < 0.35;
  if (manual && view.availableAnnouncements.length > 0 && !forgetAnn) {
    const anns = bestAnnouncementSet(view.hand, view.contract);
    if (anns.length) action.announcements = anns;
  }
  if (!forgetBelot && canDeclareBelot(view.hand, card, view.contract, view.currentTrick)) action.belot = true;
  return action;
}

/** 32-bit FNV-1a over the public information + own hand: a fog-invariant seed for chooseAutoAction. */
export function viewSeed(view: BotView): number {
  const s = JSON.stringify([
    view.seat,
    view.roundNumber,
    view.score,
    view.dealer,
    view.hand,
    view.bids,
    view.playedTricks ?? [],
    view.currentTrick,
  ]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
