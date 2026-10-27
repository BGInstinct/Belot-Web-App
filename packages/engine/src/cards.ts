import type { Card, Contract, Rank, Seat, Suit, Team, Trick } from './types';

export const SUITS: readonly ['C', 'D', 'H', 'S'] = ['C', 'D', 'H', 'S'];
export const RANKS: readonly ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function cardId(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

/** Sequence order index (7=0 … A=7) — used for announcements. */
export function seqIndex(rank: Rank): number {
  return RANKS.indexOf(rank);
}

const TRUMP_STRENGTH: Record<Rank, number> = { '7': 1, '8': 2, Q: 3, K: 4, '10': 5, A: 6, '9': 7, J: 8 };
const PLAIN_STRENGTH: Record<Rank, number> = { '7': 1, '8': 2, '9': 3, J: 4, Q: 5, K: 6, '10': 7, A: 8 };
const TRUMP_POINTS: Record<Rank, number> = { '7': 0, '8': 0, '9': 14, '10': 10, J: 20, Q: 3, K: 4, A: 11 };
const PLAIN_POINTS: Record<Rank, number> = { '7': 0, '8': 0, '9': 0, '10': 10, J: 2, Q: 3, K: 4, A: 11 };

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team;
}

export function nextSeat(seat: Seat, n = 1): Seat {
  return ((seat + n) % 4) as Seat;
}

/** Whether the card is a trump under the contract (every card in AT, none in NT). */
export function isTrump(card: Card, contract: Contract): boolean {
  if (contract.kind === 'AT') return true;
  if (contract.kind === 'NT') return false;
  return card.suit === contract.suit;
}

export function trumpSuit(contract: Contract): Suit | null {
  return contract.kind === 'suit' ? contract.suit : null;
}

/** Strength of a card within its own suit under the contract (higher = stronger). */
export function strength(card: Card, contract: Contract): number {
  return isTrump(card, contract) ? TRUMP_STRENGTH[card.rank] : PLAIN_STRENGTH[card.rank];
}

export function cardPoints(card: Card, contract: Contract): number {
  return isTrump(card, contract) ? TRUMP_POINTS[card.rank] : PLAIN_POINTS[card.rank];
}

/**
 * Does card `a` beat the card `best` currently holding the trick? `best` is always either of the led suit
 * or a trump, so a card of a different (non-trump) suit can never beat it.
 */
export function beats(a: Card, best: Card, contract: Contract): boolean {
  if (a.suit === best.suit) return strength(a, contract) > strength(best, contract);
  return contract.kind === 'suit' && a.suit === contract.suit;
}

/** The play currently holding (or having won) the trick. Trick must have at least one play. */
export function currentWinningPlay(trick: Trick, contract: Contract) {
  let best = trick.plays[0];
  for (const p of trick.plays.slice(1)) if (beats(p.card, best.card, contract)) best = p;
  return best;
}

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank });
  return deck;
}

/** Fisher–Yates shuffle with injected rng (returns a new array). */
export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function hasCard(hand: readonly Card[], card: Card): boolean {
  return hand.some((c) => sameCard(c, card));
}

export function removeCard(hand: readonly Card[], card: Card): Card[] {
  const i = hand.findIndex((c) => sameCard(c, card));
  return i < 0 ? hand.slice() : [...hand.slice(0, i), ...hand.slice(i + 1)];
}

/** Small deterministic PRNG (mulberry32) — handy for seeded games and tests. */
export function seededRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
