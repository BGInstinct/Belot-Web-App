/**
 * Card play for the easy and medium tiers (no sampling).
 *  easy   — random legal card; weak bias against throwing an ace when it may discard.
 *  medium — follow/trump strategy with high-card tracking from the public trick history: draws trumps with
 *           the master trump when declaring, leads masters, never overtakes a partner who holds the trick
 *           safely (smears points instead), wins cheaply / with masters, ruffs low, discards cheap cards.
 */
import type { Card, PlayerView } from '../types';
import { aboveInSuit, cheapest, fromBit, highBit, isTrumpBit, maskOf, suitMask, winningIdx } from './bits';
import { buildKnowledge } from './knowledge';

export function easyCard(view: PlayerView, rng: () => number): Card {
  const legal = view.legalCards;
  let pick = legal[Math.floor(rng() * legal.length)] ?? legal[0];
  const t = view.currentTrick;
  const discarding = !!t && t.plays.length > 0 && !legal.some((c) => c.suit === t.plays[0].card.suit);
  if (discarding && pick.rank === 'A' && rng() < 0.5) {
    const others = legal.filter((c) => c.rank !== 'A');
    if (others.length) pick = others[Math.floor(rng() * others.length)];
  }
  return pick;
}

export function mediumCard(view: PlayerView): Card {
  const k = buildKnowledge(view);
  const enc = k.enc;
  const legal = maskOf(enc, view.legalCards);
  if ((legal & (legal - 1)) === 0) return view.legalCards[0];
  const unseen = k.unseen;
  const trumpM = enc.trump >= 0 ? suitMask(enc.trump) : 0;
  /** no unseen card of the same suit is higher (ruffs ignored) */
  const isMaster = (b: number) => (unseen & aboveInSuit(b)) === 0;
  const plays = k.plays;
  if (plays.length === 0) {
    const declaring = k.declTeam === k.myTeam;
    if (enc.trump >= 0 && declaring && (unseen & trumpM) !== 0) {
      const top = highBit(legal & trumpM);
      if (top >= 0 && isMaster(top)) return fromBit(enc, top);
    }
    let best = -1;
    let bk = -Infinity;
    for (let s = 0; s < 4; s++) {
      if (s === enc.trump) continue;
      const top = highBit(legal & suitMask(s));
      if (top < 0 || !isMaster(top)) continue;
      // a suit nobody else has left is likely to be ruffed in a suit game
      if (enc.trump >= 0 && (unseen & suitMask(s)) === 0 && (unseen & trumpM) !== 0) continue;
      const key = enc.pts[top] * 10 + (top & 7);
      if (key > bk) {
        bk = key;
        best = top;
      }
    }
    if (best >= 0) return fromBit(enc, best);
    return fromBit(enc, cheapest(enc, legal));
  }
  const pos = plays.length;
  const wIdx = winningIdx(enc, plays);
  const wSeat = (k.leader + wIdx) % 4;
  const wBit = plays[wIdx];
  const nonTrump = legal & ~trumpM;
  if ((wSeat & 1) === k.myTeam) {
    // partner holds the trick: don't overtake; give points when it looks safe
    const safe = pos === 3 || isMaster(wBit);
    if (safe && nonTrump !== 0) {
      let best = -1;
      let bk = -Infinity;
      for (let m = nonTrump; m !== 0; m &= m - 1) {
        const b = 31 - Math.clz32(m & -m);
        // keep own masters (they will win tricks later) unless they're the only points
        const key = enc.pts[b] * 10 - (isMaster(b) && enc.pts[b] >= 10 ? 55 : 0) - (b & 7);
        if (key > bk) {
          bk = key;
          best = b;
        }
      }
      return fromBit(enc, best);
    }
    return fromBit(enc, cheapest(enc, legal));
  }
  let winners = 0;
  for (let m = legal; m !== 0; m &= m - 1) {
    const b = 31 - Math.clz32(m & -m);
    if (b >> 3 === wBit >> 3 ? b > wBit : enc.trump >= 0 && b >> 3 === enc.trump) winners |= 1 << b;
  }
  if (winners === 0) return fromBit(enc, cheapest(enc, legal));
  const plainW = winners & ~trumpM;
  const trumpW = winners & trumpM;
  const maxPts = (mask: number, needMaster: boolean) => {
    let best = -1;
    let bk = -Infinity;
    for (let m = mask; m !== 0; m &= m - 1) {
      const b = 31 - Math.clz32(m & -m);
      if (needMaster && !isMaster(b)) continue;
      const key = enc.pts[b] * 10 - (b & 7);
      if (key > bk) {
        bk = key;
        best = b;
      }
    }
    return best;
  };
  const lowestOf = (mask: number) => (mask === 0 ? -1 : 31 - Math.clz32(mask & -mask));
  if (pos === 3) {
    if (plainW !== 0 && !isTrumpBit(enc, lowestOf(plainW))) return fromBit(enc, maxPts(plainW, false));
    return fromBit(enc, lowestOf(winners));
  }
  if (plainW !== 0) {
    if (!enc.allTrump) {
      const m = maxPts(plainW, true);
      if (m >= 0) return fromBit(enc, m);
      return fromBit(enc, highBit(plainW));
    }
  }
  if (enc.allTrump) {
    const masters = [...Array(32).keys()].filter((b) => ((winners >>> b) & 1) === 1 && isMaster(b));
    if (masters.length) return fromBit(enc, masters[0]);
    return fromBit(enc, lowestOf(winners));
  }
  // ruff (void in the led suit): lowest winning trump
  return fromBit(enc, lowestOf(trumpW));
}
