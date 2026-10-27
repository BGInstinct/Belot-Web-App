/**
 * Perfect-information evaluation of ONE sampled deal (determinization) for the hard bot:
 *  - `rollout`: play the rest of the round with a fast greedy policy that sees the sampled hands;
 *  - `solve`: exact alpha-beta search of the remaining tricks (endgame), with a transposition table at trick
 *    boundaries and equivalent-card pruning; aborts (throws) beyond a node budget.
 * Both score the round outcome the way the engine does (contract made / failed / hanging, contra multiplier,
 * capo, announcements, belot, last 10, hanging pot) as "our recorded raw points minus theirs".
 */
import { bestAnnouncementSet, resolveAnnouncements } from '../announcements';
import type { Announcement, Contract, Seat } from '../types';
import {
  aboveInSuit,
  cheapest,
  fromBit,
  has,
  highBit,
  isTrumpBit,
  legalMask,
  suitMask,
  winningIdx,
  type Enc,
} from './bits';
import type { Knowledge } from './knowledge';

export interface SimCtx {
  enc: Enc;
  myTeam: number;
  declTeam: number;
  mult: number;
  hangRaw: number;
  /** announcement + belot points per team expected for this deal */
  ann: [number, number];
}

export interface SimState {
  h: number[];
  leader: number;
  plays: number[];
  pts: [number, number];
  won: [number, number];
  done: number;
}

export function baseState(k: Knowledge, deal: number[]): SimState {
  return {
    h: deal.slice(),
    leader: k.leader,
    plays: k.plays.slice(),
    pts: [k.trickPts[0], k.trickPts[1]],
    won: [k.tricksWon[0], k.tricksWon[1]],
    done: k.tricksDone,
  };
}

export function cloneState(s: SimState): SimState {
  return { h: s.h.slice(), leader: s.leader, plays: s.plays.slice(), pts: [s.pts[0], s.pts[1]], won: [s.won[0], s.won[1]], done: s.done };
}

/** Announcements expected in this deal: declared ones + first-card declarations still to come + belots. */
export function makeCtx(k: Knowledge, contract: Contract, deal: number[]): SimCtx {
  const enc = k.enc;
  const declared: { seat: Seat; announcement: Announcement }[] = k.declared.slice();
  if (contract.kind !== 'NT') {
    for (let s = 0; s < 4; s++) {
      if (!k.hasPlayed[s] && k.tricksDone === 0) {
        const cards = [];
        for (let m = deal[s]; m !== 0; m &= m - 1) cards.push(fromBit(enc, 31 - Math.clz32(m & -m)));
        for (const a of bestAnnouncementSet(cards, contract)) declared.push({ seat: s as Seat, announcement: a });
      }
    }
  }
  const { combos, belot } = resolveAnnouncements(declared);
  const ann: [number, number] = [combos[0] + belot[0], combos[1] + belot[1]];
  // belots still to come: Q and K of a trump suit both unplayed in one hand (suit game: the trump suit)
  if (enc.trump >= 0) {
    const q = enc.trump * 8 + 2;
    const kk = enc.trump * 8 + 3;
    for (let s = 0; s < 4; s++) if (has(deal[s], q) && has(deal[s], kk)) ann[s & 1] += 20;
  } else if (enc.allTrump) {
    for (let suit = 0; suit < 4; suit++)
      for (let s = 0; s < 4; s++) if (has(deal[s], suit * 8 + 2) && has(deal[s], suit * 8 + 3)) ann[s & 1] += 20;
  }
  return { enc, myTeam: k.myTeam, declTeam: k.declTeam, mult: k.mult, hangRaw: k.hangRaw, ann };
}

/** Round result from our team's perspective (raw points, ×multiplier), mirroring scoring.ts. */
export function finalValue(ctx: SimCtx, pts: readonly number[], won: readonly number[]): number {
  const m = ctx.enc.nt ? 2 : 1;
  const capo = won[0] === 8 ? 0 : won[1] === 8 ? 1 : -1;
  const r0 = pts[0] * m + ctx.ann[0] + (capo === 0 ? 90 : 0);
  const r1 = pts[1] * m + ctx.ann[1] + (capo === 1 ? 90 : 0);
  const d = ctx.declTeam;
  const rd = d === 0 ? r0 : r1;
  const ro = d === 0 ? r1 : r0;
  let recD = 0;
  let recO = 0;
  if (rd > ro) {
    if (ctx.mult === 1) {
      recD = rd;
      recO = ro;
    } else recD = (r0 + r1) * ctx.mult;
    recD += ctx.hangRaw;
  } else if (rd < ro) {
    recO = (r0 + r1) * ctx.mult + ctx.hangRaw;
  } else if (ctx.mult === 1) recO = ro;
  return ctx.myTeam === d ? recD - recO : recO - recD;
}

export function playBit(enc: Enc, st: SimState, seat: number, b: number) {
  st.h[seat] &= ~(1 << b);
  st.plays.push(b);
  if (st.plays.length === 4) {
    const w = (st.leader + winningIdx(enc, st.plays)) % 4;
    let p = st.done === 7 ? 10 : 0;
    for (const x of st.plays) p += enc.pts[x];
    st.pts[w & 1] += p;
    st.won[w & 1]++;
    st.done++;
    st.leader = w;
    st.plays = [];
  }
}

/**
 * Can an opponent of the trick's current holder, at positions fromPos..3, beat the holding card?
 * (perfect information: uses the hands in `h`)
 */
function beatable(enc: Enc, h: readonly number[], plays: readonly number[], leader: number, fromPos: number): boolean {
  const wIdx = winningIdx(enc, plays);
  const wBit = plays[wIdx];
  const wTeam = ((leader + wIdx) % 4) & 1;
  const led = plays[0] >> 3;
  for (let pos = fromPos; pos < 4; pos++) {
    const s = (leader + pos) % 4;
    if ((s & 1) === wTeam) continue;
    const hand = h[s];
    if ((hand & suitMask(led)) !== 0) {
      if (wBit >> 3 === led && (hand & aboveInSuit(wBit)) !== 0) return true;
    } else if (enc.trump >= 0 && (hand & suitMask(enc.trump)) !== 0) {
      if (wBit >> 3 !== enc.trump || (hand & aboveInSuit(wBit)) !== 0) return true;
    }
  }
  return false;
}

/** max-points non-trump card of mask (suit game), else max points; ties → weaker card */
function smear(enc: Enc, mask: number): number {
  let best = -1;
  let bk = -Infinity;
  for (let m = mask; m !== 0; m &= m - 1) {
    const b = 31 - Math.clz32(m & -m);
    const k = (enc.trump >= 0 && b >> 3 === enc.trump ? -1000 : 0) + enc.pts[b] * 10 - (b & 7);
    if (k > bk) {
      bk = k;
      best = b;
    }
  }
  return enc.trump >= 0 && best >> 3 === enc.trump ? cheapest(enc, mask) : best;
}

/** Greedy perfect-information policy used for rollouts. */
export function policy(enc: Enc, st: SimState, seat: number, legal: number): number {
  if ((legal & (legal - 1)) === 0) return 31 - Math.clz32(legal);
  const h = st.h;
  const plays = st.plays;
  if (plays.length === 0) {
    const oppT = enc.trump >= 0 ? (h[(seat + 1) % 4] | h[(seat + 3) % 4]) & suitMask(enc.trump) : 0;
    let best = -1;
    let bk = -Infinity;
    const probe = [0];
    for (let s = 0; s < 4; s++) {
      const top = highBit(legal & suitMask(s));
      if (top < 0) continue;
      probe[0] = top;
      if (beatable(enc, h, probe, seat, 1)) continue;
      const trumpSuit = s === enc.trump;
      const k = enc.pts[top] + (trumpSuit ? (oppT !== 0 ? 40 : -40) : 0);
      if (k > bk) {
        bk = k;
        best = top;
      }
    }
    if (best >= 0) return best;
    // lead low into a suit where partner holds a sure winner
    const partner = (seat + 2) % 4;
    for (let s = 0; s < 4; s++) {
      const mine = legal & suitMask(s);
      const ptop = highBit(h[partner] & suitMask(s));
      if (mine === 0 || ptop < 0) continue;
      const low = cheapest(enc, mine);
      if (low > ptop) continue;
      const opp = (h[(seat + 1) % 4] | h[(seat + 3) % 4]) & suitMask(s);
      if ((opp & aboveInSuit(ptop)) !== 0) continue;
      if (enc.trump >= 0 && s !== enc.trump) {
        const o1 = h[(seat + 1) % 4];
        const o3 = h[(seat + 3) % 4];
        const ruff = (x: number) => (x & suitMask(s)) === 0 && (x & suitMask(enc.trump)) !== 0;
        if (ruff(o1) || ruff(o3)) continue;
      }
      return low;
    }
    return cheapest(enc, legal);
  }
  const pos = plays.length;
  const wIdx = winningIdx(enc, plays);
  const wSeat = (st.leader + wIdx) % 4;
  const wBit = plays[wIdx];
  if ((wSeat & 1) === (seat & 1)) {
    if (pos === 3 || !beatable(enc, h, plays, st.leader, pos + 1)) {
      const nonWin = legal & ~(enc.trump >= 0 ? suitMask(enc.trump) : 0);
      return smear(enc, nonWin !== 0 ? nonWin : legal);
    }
  }
  // try to win safely
  let bestSafe = -1;
  let bsk = -Infinity;
  for (let m = legal; m !== 0; m &= m - 1) {
    const b = 31 - Math.clz32(m & -m);
    const beats = b >> 3 === wBit >> 3 ? b > wBit : enc.trump >= 0 && b >> 3 === enc.trump;
    if (!beats) continue;
    plays.push(b);
    const safe = pos === 3 || !beatable(enc, h, plays, st.leader, pos + 1);
    plays.pop();
    if (!safe) continue;
    const k = isTrumpBit(enc, b) ? -100 - (b & 7) : enc.pts[b] * 10 - (b & 7);
    if (k > bsk) {
      bsk = k;
      bestSafe = b;
    }
  }
  // (when partner holds but would be beaten, taking over safely is fine too)
  if (bestSafe >= 0) return bestSafe;
  return cheapest(enc, legal);
}

export function rollout(ctx: SimCtx, st: SimState): number {
  const enc = ctx.enc;
  while (st.done < 8) {
    const seat = (st.leader + st.plays.length) % 4;
    const legal = legalMask(enc, st.h[seat], st.plays, st.leader, seat);
    if (legal === 0) break; // malformed (inconsistent counts)
    playBit(enc, st, seat, policy(enc, st, seat, legal));
  }
  return finalValue(ctx, st.pts, st.won);
}

export class BudgetExceeded extends Error {}

interface TTEntry {
  v: number;
  f: 0 | 1 | 2; // 0 exact, 1 lower bound, 2 upper bound
}

export interface Solver {
  ctx: SimCtx;
  tt: Map<number, TTEntry>;
  nodes: number;
  budget: number;
}

/** candidates with equivalent cards (adjacent among cards in play, same points) collapsed */
export function distinctMoves(enc: Enc, inPlay: number, legal: number): number[] {
  const out: number[] = [];
  for (let s = 0; s < 4; s++) {
    if ((legal & suitMask(s)) === 0) continue;
    let rep = -1;
    for (let b = s * 8 + 7; b >= s * 8; b--) {
      if (!has(inPlay, b)) continue;
      if (has(legal, b)) {
        if (rep >= 0 && enc.pts[rep] === enc.pts[b]) continue;
        out.push(b);
        rep = b;
      } else rep = -1;
    }
  }
  return out;
}

export function solve(sv: Solver, st: SimState, alpha: number, beta: number): number {
  const ctx = sv.ctx;
  if (st.done === 8) return finalValue(ctx, st.pts, st.won);
  if (++sv.nodes > sv.budget) throw new BudgetExceeded();
  const enc = ctx.enc;
  const n = st.plays.length;
  const seat = (st.leader + n) % 4;
  const all = st.h[0] | st.h[1] | st.h[2] | st.h[3];
  let key = -1;
  if (n === 0) {
    key = (((all >>> 0) * 4 + st.leader) * 512 + st.pts[0]) * 16 + st.won[0];
    const e = sv.tt.get(key);
    if (e) {
      if (e.f === 0) return e.v;
      if (e.f === 1 && e.v >= beta) return e.v;
      if (e.f === 2 && e.v <= alpha) return e.v;
    }
  }
  let inPlay = all;
  for (const p of st.plays) inPlay |= 1 << p;
  const legal = legalMask(enc, st.h[seat], st.plays, st.leader, seat);
  if (legal === 0) return finalValue(ctx, st.pts, st.won); // malformed (inconsistent counts)
  const moves = distinctMoves(enc, inPlay, legal);
  // move ordering: greedy policy's choice first
  if (moves.length > 1) {
    const g = policy(enc, st, seat, legal);
    const i = moves.indexOf(g);
    if (i > 0) {
      moves.splice(i, 1);
      moves.unshift(g);
    }
  }
  const max = (seat & 1) === ctx.myTeam;
  const a0 = alpha;
  const b0 = beta;
  let best = max ? -Infinity : Infinity;
  for (const b of moves) {
    const leader = st.leader;
    const p0 = st.pts[0];
    const p1 = st.pts[1];
    const w0 = st.won[0];
    const w1 = st.won[1];
    const done = st.done;
    const plays = st.plays;
    const hand = st.h[seat];
    if (n === 3) st.plays = plays.slice();
    playBit(enc, st, seat, b);
    const v = solve(sv, st, alpha, beta);
    st.h[seat] = hand;
    st.leader = leader;
    st.pts[0] = p0;
    st.pts[1] = p1;
    st.won[0] = w0;
    st.won[1] = w1;
    st.done = done;
    if (n === 3) st.plays = plays;
    else plays.pop();
    if (max) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  if (n === 0) sv.tt.set(key, { v: best, f: best <= a0 ? 2 : best >= b0 ? 1 : 0 });
  return best;
}

