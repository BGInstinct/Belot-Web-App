/**
 * Bitmask card encoding for the bots (fast simulation). Card bit = suit*8 + strength position within the suit
 * under the contract, so "higher in suit" is a bit range. A transcription of rules.ts `legalCardsFor` works on
 * these masks (cross-checked against the real function in bot.test.ts).
 *
 * FOG OF WAR: this module (like everything in bot/) only ever sees PlayerView-derived data.
 */
import { SUITS } from '../cards';
import type { Card, Contract, Rank } from '../types';

export const TRUMP_ORDER: readonly Rank[] = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];
export const PLAIN_ORDER: readonly Rank[] = ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'];
const TRUMP_PTS = [0, 0, 3, 4, 10, 11, 14, 20];
const PLAIN_PTS = [0, 0, 0, 2, 3, 4, 10, 11];

export const FULL = -1; // all 32 bits

export function suitMask(s: number): number {
  return (0xff << (s * 8)) | 0;
}

/** bits strictly above bit i within i's suit */
export function aboveInSuit(i: number): number {
  const low = i >= 31 ? -1 : ((1 << (i + 1)) - 1) | 0;
  return suitMask(i >> 3) & ~low;
}

export function popcount(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

export function lowBit(x: number): number {
  return x === 0 ? -1 : 31 - Math.clz32(x & -x);
}

export function highBit(x: number): number {
  return x === 0 ? -1 : 31 - Math.clz32(x);
}

export function bitsOf(x: number): number[] {
  const out: number[] = [];
  while (x !== 0) {
    const b = 31 - Math.clz32(x & -x);
    out.push(b);
    x &= x - 1;
  }
  return out;
}

export const has = (mask: number, b: number) => ((mask >>> b) & 1) === 1;

export interface Enc {
  /** suit index of the trump in a suit game, -1 otherwise */
  trump: number;
  allTrump: boolean;
  nt: boolean;
  strict: boolean;
  /** card points per bit */
  pts: number[];
  /** mask of trump cards (all in AT, none in NT) */
  trumpMask: number;
}

export function makeEnc(contract: Contract, strict: boolean): Enc {
  const trump = contract.kind === 'suit' ? SUITS.indexOf(contract.suit) : -1;
  const allTrump = contract.kind === 'AT';
  const pts: number[] = [];
  for (let b = 0; b < 32; b++) {
    const t = allTrump || b >> 3 === trump;
    pts.push((t ? TRUMP_PTS : PLAIN_PTS)[b & 7]);
  }
  return {
    trump,
    allTrump,
    nt: contract.kind === 'NT',
    strict,
    pts,
    trumpMask: allTrump ? FULL : trump >= 0 ? suitMask(trump) : 0,
  };
}

export function isTrumpBit(enc: Enc, b: number): boolean {
  return enc.allTrump || b >> 3 === enc.trump;
}

export function toBit(enc: Enc, c: Card): number {
  const s = SUITS.indexOf(c.suit);
  const order = enc.allTrump || s === enc.trump ? TRUMP_ORDER : PLAIN_ORDER;
  return s * 8 + order.indexOf(c.rank);
}

export function fromBit(enc: Enc, b: number): Card {
  const s = b >> 3;
  const order = enc.allTrump || s === enc.trump ? TRUMP_ORDER : PLAIN_ORDER;
  return { suit: SUITS[s], rank: order[b & 7] };
}

export function maskOf(enc: Enc, cards: readonly Card[]): number {
  let m = 0;
  for (const c of cards) m |= 1 << toBit(enc, c);
  return m;
}

/** index into plays of the play currently holding the trick */
export function winningIdx(enc: Enc, plays: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < plays.length; i++) {
    const a = plays[i];
    const b = plays[best];
    if (a >> 3 === b >> 3) {
      if (a > b) best = i;
    } else if (enc.trump >= 0 && a >> 3 === enc.trump) best = i;
  }
  return best;
}

/** does card a beat card best (best = current holder of the trick)? */
export function beatsBit(enc: Enc, a: number, best: number): boolean {
  if (a >> 3 === best >> 3) return a > best;
  return enc.trump >= 0 && a >> 3 === enc.trump;
}

/** Bitmask transcription of rules.ts legalCardsFor. `plays` are the bits played so far in the trick. */
export function legalMask(enc: Enc, hand: number, plays: readonly number[], leader: number, seat: number): number {
  if (plays.length === 0) return hand;
  const led = plays[0] >> 3;
  const follow = hand & suitMask(led);
  if (follow !== 0) {
    if (enc.strict && (enc.allTrump || led === enc.trump)) {
      let highest = -1;
      for (const p of plays) if (p >> 3 === led && p > highest) highest = p;
      const higher = follow & aboveInSuit(highest);
      if (higher !== 0) return higher;
    }
    return follow;
  }
  if (enc.trump < 0) return hand;
  const winnerSeat = (leader + winningIdx(enc, plays)) % 4;
  if ((winnerSeat & 1) === (seat & 1)) return hand;
  const trumps = hand & suitMask(enc.trump);
  if (trumps === 0) return hand;
  if (!enc.strict) return trumps;
  let highest = -1;
  for (const p of plays) if (p >> 3 === enc.trump && p > highest) highest = p;
  if (highest >= 0) {
    const higher = trumps & aboveInSuit(highest);
    return higher !== 0 ? higher : hand;
  }
  return trumps;
}

/** "Cheapness" of a card: least points, weakest, trumps last in a suit game. Lower = cheaper. */
export function cheapKey(enc: Enc, b: number): number {
  return (enc.trump >= 0 && b >> 3 === enc.trump ? 1000 : 0) + enc.pts[b] * 10 + (b & 7);
}

export function cheapest(enc: Enc, mask: number): number {
  let best = -1;
  let bk = Infinity;
  for (let m = mask; m !== 0; m &= m - 1) {
    const b = 31 - Math.clz32(m & -m);
    const k = cheapKey(enc, b);
    if (k < bk) {
      bk = k;
      best = b;
    }
  }
  return best;
}
