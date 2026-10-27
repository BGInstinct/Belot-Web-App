import { useEffect, useState } from 'react';
import type { Announcement, Bid, Card, Contract, RoomView, Seat, Suit } from '@belot/engine';

/** Position of a seat relative to the viewer. Play is counter-clockwise: seat+1 sits to the viewer's right. */
export type SeatPos = 'bottom' | 'right' | 'top' | 'left';
const POS: SeatPos[] = ['bottom', 'right', 'top', 'left'];

export function relPos(seat: Seat, mySeat: Seat | null): SeatPos {
  return POS[(seat - (mySeat ?? 0) + 4) % 4];
}

export const SEATS: Seat[] = [0, 1, 2, 3];

export function teamOf(seat: Seat): 0 | 1 {
  return (seat % 2) as 0 | 1;
}

/** Own seat: the game view's seat when available, else match the server-assigned player id. */
export function findMySeat(room: RoomView | null, myId: string | null, viewSeat?: Seat | null): Seat | null {
  if (viewSeat !== undefined && viewSeat !== null) return viewSeat;
  return room?.seats.find((s) => !s.isBot && s.player?.id === myId)?.seat ?? null;
}

export function seatName(room: RoomView | null, seat: Seat, botLabel: string, emptyLabel: string): string {
  const info = room?.seats[seat];
  if (!info) return emptyLabel;
  if (info.player?.name) return info.player.name;
  if (info.isBot) return `${botLabel} ${seat + 1}`;
  return emptyLabel;
}

export const SUIT_SYMBOL: Record<Suit, string> = { C: '♣', D: '♦', H: '♥', S: '♠' };
export const isRedSuit = (s: Suit) => s === 'D' || s === 'H';

/** i18n key for a contract (game namespace) */
export function contractKey(c: Contract): string {
  return c.kind === 'suit' ? `suits.${c.suit}` : `contracts.${c.kind}`;
}

export function bidKey(b: Bid): string {
  if (b.kind === 'contract') return contractKey(b.contract);
  return `bids.${b.kind}`;
}

export function sameBid(a: Bid, b: Bid): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'contract' && b.kind === 'contract') {
    if (a.contract.kind !== b.contract.kind) return false;
    if (a.contract.kind === 'suit' && b.contract.kind === 'suit') return a.contract.suit === b.contract.suit;
  }
  return true;
}

export function isTrumpSuit(contract: Contract | null, suit: Suit): boolean {
  if (!contract) return false;
  if (contract.kind === 'AT') return true;
  return contract.kind === 'suit' && contract.suit === suit;
}

export function annKey(a: Announcement): string {
  return `${a.type}:${a.suit ?? ''}:${a.highRank}:${a.cards.map((c) => c.rank + c.suit).sort().join(',')}`;
}

export function annOverlaps(a: Announcement, b: Announcement): boolean {
  return a.cards.some((c) => b.cards.some((d) => c.rank === d.rank && c.suit === d.suit));
}

const SORT_SUITS: Suit[] = ['S', 'H', 'C', 'D'];
const RANK_ORDER = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const TRUMP_ORDER = ['7', '8', 'Q', 'K', '10', 'A', '9', 'J'];

/** Sort a hand for display: alternating colours, ranks ascending by strength for the contract. */
export function sortHand(hand: Card[], contract: Contract | null): Card[] {
  return [...hand].sort((a, b) => {
    if (a.suit !== b.suit) return SORT_SUITS.indexOf(a.suit) - SORT_SUITS.indexOf(b.suit);
    const order = isTrumpSuit(contract, a.suit) ? TRUMP_ORDER : RANK_ORDER;
    return order.indexOf(a.rank) - order.indexOf(b.rank);
  });
}

export function useViewport() {
  const get = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [vp, setVp] = useState(get);
  useEffect(() => {
    const on = () => setVp(get());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return vp;
}

/**
 * Integer pixel scales for cards depending on the screen (sprites are 23x35 art px).
 * Tuned for laptops: 1366x768 / 1280x800 -> hand 4, 1440x900 -> 5, 1920x1080 -> 6.
 */
export function useCardScales() {
  const { w, h } = useViewport();
  const compact = h < 560 || w < 640;
  // own hand: driven mostly by height (it's the vertical budget that runs out first), capped by width
  const byH = h >= 1040 ? 6 : h >= 860 ? 5 : h >= 700 ? 4 : 3;
  const byW = w >= 1600 ? 6 : w >= 1200 ? 5 : w >= 900 ? 4 : 3;
  const hand = compact ? 2 : Math.min(byH, byW);
  return {
    compact,
    hand,
    /** centre trick cards: same as the hand on laptops, one step smaller on big screens */
    trick: compact ? 2 : hand >= 5 ? hand - 1 : hand,
    /** face-down backs of the partner (top): one step below the hand (3 on laptops, 4 at hand 5, 5 on 1080p) */
    back: compact ? 1 : Math.max(2, hand - 1),
    /** sideways backs of the left/right opponents (same steps as `back`) */
    side: compact ? 1 : Math.max(2, hand - 1),
  };
}

/** Ticking clock for countdowns. */
export function useNow(intervalMs = 200, active = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

export const CODE_ALPHABET = /[^A-HJ-NP-Z2-9]/g; // no 0/O/1/I
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(CODE_ALPHABET, '').slice(0, 6);
}
