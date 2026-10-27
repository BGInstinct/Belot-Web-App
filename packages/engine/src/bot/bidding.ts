/**
 * Bidding for the three tiers. Decisions use only the view: own 5 cards, the public bid history, legal bids.
 *  easy   — bids a suit only on its jack plus the 9 or two more cards (not always); never NT/AT, never contra.
 *  medium — standard thresholds (J+9 or J+2 of a suit; 3 aces for NT; 2 jacks + strength for AT); never contra.
 *  hard   — hand-strength evaluation of every contract (incl. NT/AT) with partner-bid awareness, selective
 *           contra / recontra.
 */
import { biddingStatus, contractRank } from '../bidding';
import type { Bid, Card, Contract, PlayerView, Suit } from '../types';

const isContract = (b: Bid): b is Extract<Bid, { kind: 'contract' }> => b.kind === 'contract';
const PASS: Bid = { kind: 'pass' };

export function easyBid(view: PlayerView, rng: () => number): Bid {
  const st = biddingStatus(view.bids);
  if (st.bidder !== null && st.bidder % 2 === (view.seat as number) % 2) return PASS;
  for (const b of view.legalBids) {
    if (!isContract(b) || b.contract.kind !== 'suit') continue;
    const suit = b.contract.suit;
    const mine = view.hand.filter((c) => c.suit === suit);
    const j = mine.some((c) => c.rank === 'J');
    if (j && (mine.some((c) => c.rank === '9') || mine.length >= 3) && rng() < 0.8) return b;
  }
  return PASS;
}

/** the original ("medium") bid scoring */
function mediumScore(hand: Card[], c: Contract): number {
  if (c.kind === 'NT') {
    const aces = hand.filter((x) => x.rank === 'A').length;
    const tens = hand.filter((x) => x.rank === '10' && hand.some((y) => y.suit === x.suit && y.rank === 'A')).length;
    return aces >= 3 || (aces >= 2 && tens >= 2) ? 10 + aces : 0;
  }
  if (c.kind === 'AT') {
    const j = hand.filter((x) => x.rank === 'J').length;
    const pts = hand.reduce((s, x) => s + (x.rank === 'J' ? 3 : x.rank === '9' ? 2 : x.rank === 'A' ? 1 : 0), 0);
    return j >= 2 && pts >= 8 ? pts : 0;
  }
  const suit = c.suit;
  const mine = hand.filter((x) => x.suit === suit);
  const hasJ = mine.some((x) => x.rank === 'J');
  const has9 = mine.some((x) => x.rank === '9');
  const sideAces = hand.filter((x) => x.rank === 'A' && x.suit !== suit).length;
  if (hasJ && (has9 || mine.length >= 3)) return 5 + mine.length + sideAces + (has9 ? 2 : 0);
  return 0;
}

export function mediumBid(view: PlayerView): Bid {
  const st = biddingStatus(view.bids);
  if (st.bidder !== null && st.bidder % 2 === (view.seat as number) % 2) return PASS;
  let best: { bid: Bid; contract: Contract; score: number } | null = null;
  for (const b of view.legalBids) {
    if (!isContract(b)) continue;
    const sc = mediumScore(view.hand, b.contract);
    if (sc > 0 && (!best || sc > best.score || (sc === best.score && contractRank(b.contract) > contractRank(best.contract))))
      best = { bid: b, contract: b.contract, score: sc };
  }
  return best ? best.bid : PASS;
}

// ---------------------------------------------------------------- hard

const has = (h: Card[], suit: Suit, rank: Card['rank']) => h.some((c) => c.suit === suit && c.rank === rank);

/** Strength of a 5-card hand for a suit contract (≈ expected trick-taking value). */
function suitStrength(hand: Card[], suit: Suit): number {
  const mine = hand.filter((c) => c.suit === suit);
  const J = has(hand, suit, 'J');
  const N = has(hand, suit, '9');
  let v = 0;
  if (J) v += 3.2;
  if (N) v += J ? 2.4 : mine.length >= 3 ? 1.6 : 0.9;
  if (has(hand, suit, 'A')) v += J || N ? 1.3 : 0.8;
  if (has(hand, suit, '10')) v += J || N ? 0.9 : 0.5;
  for (const c of mine) if (c.rank === 'K' || c.rank === 'Q' || c.rank === '8' || c.rank === '7') v += 0.55;
  if (has(hand, suit, 'K') && has(hand, suit, 'Q')) v += 1.2; // belot
  if (mine.length >= 3) v += 0.6 * (mine.length - 2);
  for (const c of hand) {
    if (c.suit === suit) continue;
    if (c.rank === 'A') v += 1.1;
    else if (c.rank === '10') v += has(hand, c.suit, 'A') ? 0.6 : 0.2;
  }
  return v;
}

function ntStrength(hand: Card[]): number {
  let v = 0;
  for (const c of hand) {
    if (c.rank === 'A') v += 2.6;
    else if (c.rank === '10') v += has(hand, c.suit, 'A') ? 1.6 : 0.4;
    else if (c.rank === 'K') v += has(hand, c.suit, 'A') && has(hand, c.suit, '10') ? 0.8 : 0;
  }
  return v;
}

function atStrength(hand: Card[]): number {
  let v = 0;
  for (const c of hand) {
    if (c.rank === 'J') v += 2.7;
    else if (c.rank === '9') v += has(hand, c.suit, 'J') ? 1.9 : 0.8;
    else if (c.rank === 'A') v += has(hand, c.suit, 'J') || has(hand, c.suit, '9') ? 0.9 : 0.5;
    else if (c.rank === '10') v += has(hand, c.suit, 'J') && has(hand, c.suit, '9') ? 0.6 : 0.2;
  }
  return v;
}

function strengthFor(hand: Card[], c: Contract): number {
  return c.kind === 'suit' ? suitStrength(hand, c.suit) : c.kind === 'NT' ? ntStrength(hand) : atStrength(hand);
}

/** opening thresholds (5 cards) */
function threshold(c: Contract): number {
  return c.kind === 'suit' ? 5.0 : c.kind === 'NT' ? 7.6 : 8.2;
}

export function hardBid(view: PlayerView): Bid {
  const me = view.seat as number;
  const st = biddingStatus(view.bids);
  const legal = view.legalBids;
  const canContra = legal.some((b) => b.kind === 'contra');
  const canRecontra = legal.some((b) => b.kind === 'recontra');
  const hand = view.hand;
  const partner = (me + 2) % 4;
  const partnerBids = view.bids.filter((b) => b.seat === partner && b.bid.kind === 'contract');
  const oursHeld = st.bidder !== null && st.bidder % 2 === me % 2;

  if (oursHeld && st.contract) {
    if (canRecontra && strengthFor(hand, st.contract) >= threshold(st.contract) + 2.4) return { kind: 'recontra' };
    // overbid partner only with a clearly better higher contract (e.g. partner's suit → our All Trumps)
    if (st.bidder === partner && st.contract.kind === 'suit') {
      const at = legal.find((b) => isContract(b) && b.contract.kind === 'AT');
      const supportJ = has(hand, st.contract.suit, 'J') ? 1.5 : 0;
      if (at && atStrength(hand) + supportJ >= threshold({ kind: 'AT' }) + 1.5) return at;
    }
    return PASS;
  }

  // selective contra against the opponents' contract
  if (canContra && st.contract) {
    const c = st.contract;
    let defend = 0;
    if (c.kind === 'suit') {
      const J = has(hand, c.suit, 'J');
      const N = has(hand, c.suit, '9');
      const trumps = hand.filter((x) => x.suit === c.suit).length;
      const sideAces = hand.filter((x) => x.rank === 'A' && x.suit !== c.suit).length;
      if (J && N) defend = 3 + trumps + sideAces;
      else if (J && trumps >= 3) defend = 1.5 + trumps + sideAces;
    } else if (c.kind === 'NT') {
      const aces = hand.filter((x) => x.rank === 'A').length;
      defend = aces >= 3 ? 4 + aces : 0;
    } else {
      const js = hand.filter((x) => x.rank === 'J').length;
      const nines = hand.filter((x) => x.rank === '9' && has(hand, x.suit, 'J')).length;
      defend = js >= 3 ? 5 + nines : js >= 2 && nines >= 2 ? 5 : 0;
    }
    if (defend >= 7) return { kind: 'contra' };
  }

  let best: { bid: Bid; margin: number; rank: number } | null = null;
  for (const b of legal) {
    if (!isContract(b)) continue;
    let margin = strengthFor(hand, b.contract) - threshold(b.contract);
    // partner's earlier suit bid: their J/9 support a suit / AT contract of ours
    for (const pb of partnerBids) {
      if (pb.bid.kind !== 'contract') continue;
      const pc = pb.bid.contract;
      if (pc.kind === 'suit' && b.contract.kind === 'AT' && has(hand, pc.suit, '9')) margin += 0.8;
      if (pc.kind === 'NT' && b.contract.kind === 'NT') margin += 1;
    }
    // over an opponent's contract we need a bit more
    if (st.contract) margin -= 0.4;
    const rank = contractRank(b.contract);
    if (margin >= 0 && (!best || margin > best.margin + 0.3 || (Math.abs(margin - best.margin) <= 0.3 && rank > best.rank)))
      best = { bid: b, margin, rank };
  }
  return best ? best.bid : PASS;
}
