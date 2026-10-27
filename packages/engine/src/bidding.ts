import { teamOf } from './cards';
import type { Bid, BidRecord, Contract, Multiplier, Seat } from './types';

/**
 * Bidding conventions (standard Bulgarian Belot):
 * - Contracts ascend C < D < H < S < NT < AT; any player may overbid, including over their partner.
 * - Contra: only against the latest contract when it belongs to the opponents and is not yet doubled.
 * - Recontra: only by the team whose contract was contra'd, and only once.
 * - After contra/recontra, a higher contract may still be bid; it resets the multiplier to 1.
 * - Contra / recontra count as bids (they reset the consecutive-pass count).
 * - Bidding ends after 3 consecutive passes following any non-pass bid; 4 initial passes = all-pass round.
 */
export const CONTRACT_ORDER = ['C', 'D', 'H', 'S', 'NT', 'AT'] as const;

export function contractRank(c: Contract): number {
  return c.kind === 'suit' ? CONTRACT_ORDER.indexOf(c.suit) : c.kind === 'NT' ? 4 : 5;
}

export function contractFromRank(i: number): Contract {
  if (i === 4) return { kind: 'NT' };
  if (i === 5) return { kind: 'AT' };
  return { kind: 'suit', suit: CONTRACT_ORDER[i] as 'C' | 'D' | 'H' | 'S' };
}

export interface BidStatus {
  contract: Contract | null;
  bidder: Seat | null;
  multiplier: Multiplier;
}

export function biddingStatus(bids: readonly BidRecord[]): BidStatus {
  const s: BidStatus = { contract: null, bidder: null, multiplier: 1 };
  for (const { seat, bid } of bids) {
    if (bid.kind === 'contract') {
      s.contract = bid.contract;
      s.bidder = seat;
      s.multiplier = 1;
    } else if (bid.kind === 'contra') s.multiplier = 2;
    else if (bid.kind === 'recontra') s.multiplier = 4;
  }
  return s;
}

export function legalBidsFor(bids: readonly BidRecord[], seat: Seat): Bid[] {
  const s = biddingStatus(bids);
  const out: Bid[] = [{ kind: 'pass' }];
  const min = s.contract ? contractRank(s.contract) + 1 : 0;
  for (let i = min; i <= 5; i++) out.push({ kind: 'contract', contract: contractFromRank(i) });
  if (s.contract && s.bidder !== null) {
    const opp = teamOf(s.bidder) !== teamOf(seat);
    if (opp && s.multiplier === 1) out.push({ kind: 'contra' });
    if (!opp && s.multiplier === 2) out.push({ kind: 'recontra' });
  }
  return out;
}

export function sameBid(a: Bid, b: Bid): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'contract' && b.kind === 'contract') return contractRank(a.contract) === contractRank(b.contract);
  return true;
}

/** 'open' | 'allPass' | 'done' */
export function biddingState(bids: readonly BidRecord[]): 'open' | 'allPass' | 'done' {
  const anyBid = bids.some((b) => b.bid.kind !== 'pass');
  if (!anyBid) return bids.length >= 4 ? 'allPass' : 'open';
  let trailing = 0;
  for (let i = bids.length - 1; i >= 0 && bids[i].bid.kind === 'pass'; i--) trailing++;
  return trailing >= 3 ? 'done' : 'open';
}
