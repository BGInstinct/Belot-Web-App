import { currentWinningPlay, strength, teamOf } from './cards';
import type { Card, Contract, Seat, Trick } from './types';

/**
 * Legal cards for `seat` holding `hand` given the current trick. See RoomSettings.forceHigherCardPlacement.
 *
 * strict:  follow suit; when the led suit is trump (or in AT) beat the highest card of the led suit if you can;
 *          if void in a suit game and an opponent holds the trick you must trump, overtrumping when a trump is
 *          already on the table and you can (if you can't overtrump, any card). Partner holding the trick
 *          exempts only from the void→trump obligation.
 * relaxed: follow suit; if void in a suit game and an opponent holds the trick, play any trump.
 */
export function legalCardsFor(
  hand: readonly Card[],
  trick: Trick | null,
  contract: Contract,
  strict: boolean,
  seat: Seat,
): Card[] {
  if (!trick || trick.plays.length === 0) return hand.slice();
  const led = trick.plays[0].card.suit;
  const follow = hand.filter((c) => c.suit === led);
  const trump = contract.kind === 'suit' ? contract.suit : null;

  if (follow.length > 0) {
    if (strict && (contract.kind === 'AT' || led === trump)) {
      const highest = Math.max(...trick.plays.filter((p) => p.card.suit === led).map((p) => strength(p.card, contract)));
      const higher = follow.filter((c) => strength(c, contract) > highest);
      if (higher.length > 0) return higher;
    }
    return follow;
  }

  if (trump === null) return hand.slice(); // NT / AT: void → anything
  const winner = currentWinningPlay(trick, contract);
  if (teamOf(winner.seat) === teamOf(seat)) return hand.slice();
  const trumps = hand.filter((c) => c.suit === trump);
  if (trumps.length === 0) return hand.slice();
  if (!strict) return trumps;
  const tableTrumps = trick.plays.filter((p) => p.card.suit === trump);
  if (tableTrumps.length > 0) {
    const highest = Math.max(...tableTrumps.map((p) => strength(p.card, contract)));
    const higher = trumps.filter((c) => strength(c, contract) > highest);
    return higher.length > 0 ? higher : hand.slice();
  }
  return trumps;
}
