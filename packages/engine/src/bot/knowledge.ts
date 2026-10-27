/**
 * Public knowledge a seat can derive from its PlayerView (and nothing else):
 *  - its own hand, every card played (completed tricks via `playedTricks` + the trick in progress);
 *  - the unseen cards (= 32 − own hand − played) and how many each other seat still holds;
 *  - cards known to be held by another seat (declared announcements / belot not yet played);
 *  - "forbidden" cards per seat inferred from public play under the movement rules:
 *      · not following the led suit → void in it;
 *      · void, an opponent holding the trick, and no trump played (suit game) → no trumps at all;
 *      · strict rules: under-trumping when an overtrump was required → no higher trump;
 *      · strict rules, trump led (or AT): not beating the highest card of the led suit → no higher card of it;
 *  - soft signals (sampling weights): bids (suit / NT / AT / contra) and low discards.
 */
import { SUITS } from '../cards';
import type { Announcement, PlayerView, Seat, Trick } from '../types';
import { aboveInSuit, beatsBit, FULL, has, makeEnc, maskOf, suitMask, toBit, winningIdx, type Enc } from './bits';

export interface Knowledge {
  me: number;
  myTeam: number;
  enc: Enc;
  declTeam: number;
  mult: number;
  /** hanging pot in raw points (recorded × 10) */
  hangRaw: number;
  hand: number;
  /** all cards played this round (completed tricks + current trick) */
  played: number;
  /** cards not in my hand and not played */
  unseen: number;
  /** cards known to be held by each seat (from public declarations) */
  fixed: number[];
  /** cards each seat cannot hold (inferred voids / obligations) */
  forbidden: number[];
  /** cards each seat currently holds */
  counts: number[];
  /** sampling weight per seat per bit (soft signals), 1 = neutral */
  weights: number[][];
  /** points of completed tricks (incl. last 10 if done) and tricks won, per team */
  trickPts: [number, number];
  tricksWon: [number, number];
  tricksDone: number;
  /** current trick */
  leader: number;
  plays: number[];
  declared: { seat: Seat; announcement: Announcement }[];
  /** seats that already played a card this round */
  hasPlayed: boolean[];
}

export function buildKnowledge(view: PlayerView): Knowledge {
  const me = view.seat as number;
  const contract = view.contract!;
  const enc = makeEnc(contract, view.settings.forceHigherCardPlacement);
  const hand = maskOf(enc, view.hand);
  const completed: Trick[] = view.playedTricks ?? (view.lastTrick ? [view.lastTrick] : []);
  const current = view.currentTrick && view.currentTrick.plays.length ? view.currentTrick : null;
  const forbidden = [0, 0, 0, 0];
  const weights = [0, 1, 2, 3].map(() => new Array<number>(32).fill(1));
  const hasPlayed = [false, false, false, false];
  let played = 0;
  const trickPts: [number, number] = [0, 0];
  const tricksWon: [number, number] = [0, 0];

  const scan = (t: Trick) => {
    const bits: number[] = [];
    t.plays.forEach((p, k) => {
      const b = toBit(enc, p.card);
      const s = p.seat as number;
      hasPlayed[s] = true;
      played |= 1 << b;
      if (k > 0) infer(enc, bits, t.leader, s, b, forbidden, weights);
      bits.push(b);
    });
    return bits;
  };
  completed.forEach((t, i) => {
    const bits = scan(t);
    if (t.winner !== undefined && bits.length === 4) {
      const team = t.winner & 1;
      tricksWon[team]++;
      trickPts[team] += bits.reduce((x, b) => x + enc.pts[b], 0) + (i === 7 ? 10 : 0);
    }
  });
  const plays = current ? scan(current) : [];
  const leader = current ? current.leader : (view.turn ?? me);

  const fixed = [0, 0, 0, 0];
  for (const d of view.declared) {
    if (d.seat === me) continue;
    for (const c of d.announcement.cards) {
      const b = toBit(enc, c);
      if (!has(played, b) && !has(hand, b)) fixed[d.seat] |= 1 << b;
    }
  }
  for (let s = 0; s < 4; s++) forbidden[s] &= ~fixed[s];

  // bid signals
  for (const { seat, bid } of view.bids) {
    if (seat === me) continue;
    const w = weights[seat];
    if (bid.kind === 'contract') {
      const c = bid.contract;
      if (c.kind === 'suit') {
        const s = SUITS.indexOf(c.suit);
        const tOrder = enc.allTrump || s === enc.trump;
        // J and 9 of the bid suit (positions depend on whether that suit is trump now)
        const jPos = tOrder ? 7 : 3;
        const nPos = tOrder ? 6 : 2;
        w[s * 8 + jPos] *= 3;
        w[s * 8 + nPos] *= 2.2;
        for (let p = 0; p < 8; p++) w[s * 8 + p] *= 1.25;
      } else if (c.kind === 'NT') {
        for (let s = 0; s < 4; s++) w[s * 8 + (enc.allTrump || s === enc.trump ? 5 : 7)] *= 2;
      } else {
        for (let s = 0; s < 4; s++) {
          w[s * 8 + (enc.allTrump || s === enc.trump ? 7 : 3)] *= 2;
          w[s * 8 + (enc.allTrump || s === enc.trump ? 6 : 2)] *= 1.5;
        }
      }
    } else if (bid.kind === 'contra' && enc.trump >= 0) {
      w[enc.trump * 8 + 7] *= 1.8;
      w[enc.trump * 8 + 6] *= 1.6;
    }
  }

  const unseen = FULL & ~hand & ~played;
  const counts = view.handCounts.slice();
  const declTeam = view.declarer !== null ? view.declarer & 1 : 0;
  return {
    me,
    myTeam: me & 1,
    enc,
    declTeam,
    mult: view.multiplier,
    hangRaw: view.hanging * 10,
    hand,
    played,
    unseen,
    fixed,
    forbidden,
    counts,
    weights,
    trickPts,
    tricksWon,
    tricksDone: completed.length,
    leader,
    plays,
    declared: view.declared,
    hasPlayed,
  };
}

/** Constraints implied by seat `s` playing bit `b` after `prior` plays of a trick led by `leader`. */
function infer(
  enc: Enc,
  prior: number[],
  leader: number,
  s: number,
  b: number,
  forbidden: number[],
  weights: number[][],
) {
  const led = prior[0] >> 3;
  const suit = b >> 3;
  const wIdx = winningIdx(enc, prior);
  const winSeat = (leader + wIdx) % 4;
  const oppHolds = (winSeat & 1) !== (s & 1);
  if (suit !== led) {
    forbidden[s] |= suitMask(led);
    if (enc.trump >= 0) {
      let hi = -1;
      for (const p of prior) if (p >> 3 === enc.trump && p > hi) hi = p;
      if (suit !== enc.trump) {
        // void + opponent holding: must trump (strict: must overtrump a table trump, else free)
        if (oppHolds) forbidden[s] |= enc.strict && hi >= 0 ? aboveInSuit(hi) : suitMask(enc.trump);
        // soft signal: a worthless discard suggests weakness in that suit
        else if (enc.pts[b] === 0) for (let p = 0; p < 8; p++) weights[s][suit * 8 + p] *= 0.75;
      } else if (enc.strict && oppHolds) {
        if (hi >= 0 && !beatsBit(enc, b, hi)) forbidden[s] |= aboveInSuit(hi);
      }
    }
    return;
  }
  if (enc.strict && (enc.allTrump || led === enc.trump)) {
    let hi = -1;
    for (const p of prior) if (p >> 3 === led && p > hi) hi = p;
    if (b < hi) forbidden[s] |= aboveInSuit(hi);
  }
}
