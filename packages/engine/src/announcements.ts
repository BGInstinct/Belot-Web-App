import { RANKS, cardId, hasCard, seqIndex, teamOf } from './cards';
import type { Announcement, Card, Contract, Rank, Seat, Suit, Trick } from './types';

/**
 * Announcement conventions:
 * - Sequences use order 7<8<9<10<J<Q<K<A. 3 = tierce (20), 4 = quarte (50), 5 or more = quint (100).
 *   A run can be split, e.g. 8 in a row = quint + tierce (120) — the auto-declarer maximises points.
 * - Carre: four 10/Q/K/A = 100, four 9s = 150, four Js = 200. 7s and 8s don't count.
 * - A card may be used in at most one combination (carre OR sequence).
 * - No announcements in NT (belot impossible too).
 * - Sequence comparison: more cards wins, then higher top card; exact tie of both teams' best → all sequences
 *   are cancelled. Carre comparison: higher points, then higher rank (sequence order). The team with the best
 *   carre scores all its carres, the other team none. Belot always counts.
 * - Belot: Q+K of trump (any suit in AT), declared when the first of the pair is played. In AT it is only
 *   valid when that card leads the trick or follows the led suit (Bulgarian convention: no belot on a discard).
 */

const CARRE_POINTS: Partial<Record<Rank, number>> = { '9': 150, J: 200, '10': 100, Q: 100, K: 100, A: 100 };

function sortSeq(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => seqIndex(a.rank) - seqIndex(b.rank));
}

export function makeSequence(cards: Card[]): Announcement {
  const sorted = sortSeq(cards);
  const n = sorted.length;
  const type = n === 3 ? 'tierce' : n === 4 ? 'quarte' : 'quint';
  const points = n === 3 ? 20 : n === 4 ? 50 : 100;
  return { type, cards: sorted, points, highRank: sorted[n - 1].rank, suit: sorted[0].suit };
}

export function makeCarre(rank: Rank, cards: Card[]): Announcement {
  return { type: 'carre', cards: cards.slice(), points: CARRE_POINTS[rank] ?? 0, highRank: rank };
}

export function makeBelot(suit: Suit): Announcement {
  return {
    type: 'belot',
    cards: [
      { suit, rank: 'Q' },
      { suit, rank: 'K' },
    ],
    points: 20,
    highRank: 'K',
    suit,
  };
}

/** Maximal runs (length ≥ 3) per suit. */
function maximalRuns(hand: readonly Card[]): Card[][] {
  const runs: Card[][] = [];
  for (const suit of ['C', 'D', 'H', 'S'] as Suit[]) {
    let cur: Card[] = [];
    for (const rank of RANKS) {
      if (hasCard(hand, { suit, rank })) cur.push({ suit, rank });
      else {
        if (cur.length >= 3) runs.push(cur);
        cur = [];
      }
    }
    if (cur.length >= 3) runs.push(cur);
  }
  return runs;
}

function carres(hand: readonly Card[]): Announcement[] {
  const out: Announcement[] = [];
  for (const rank of RANKS) {
    if (!CARRE_POINTS[rank]) continue;
    const cards = hand.filter((c) => c.rank === rank);
    if (cards.length === 4) out.push(makeCarre(rank, cards));
  }
  return out;
}

function windows(run: Card[]): Card[][] {
  const out: Card[][] = [];
  for (let len = 3; len <= run.length; len++)
    for (let i = 0; i + len <= run.length; i++) out.push(run.slice(i, i + len));
  return out;
}

function key(a: Announcement): string {
  return a.type + ':' + a.cards.map(cardId).sort().join(',');
}

function seqStrength(a: Announcement): number {
  return a.cards.length * 10 + seqIndex(a.highRank);
}

/** Best non-overlapping set of combinations (max points; tie → strongest best sequence, then fewer cards). */
export function bestAnnouncementSet(hand: readonly Card[], contract: Contract): Announcement[] {
  if (contract.kind === 'NT') return [];
  const cands: Announcement[] = [...carres(hand)];
  for (const run of maximalRuns(hand)) for (const w of windows(run)) cands.push(makeSequence(w));
  let best: Announcement[] = [];
  let bestKey = [-1, -1];
  const score = (set: Announcement[]) => [
    set.reduce((s, a) => s + a.points, 0),
    Math.max(0, ...set.filter((a) => a.type !== 'carre').map(seqStrength)),
  ];
  const rec = (i: number, used: Set<string>, chosen: Announcement[]) => {
    if (i === cands.length) {
      const k = score(chosen);
      if (k[0] > bestKey[0] || (k[0] === bestKey[0] && k[1] > bestKey[1])) {
        bestKey = k;
        best = chosen.slice();
      }
      return;
    }
    const a = cands[i];
    const ids = a.cards.map(cardId);
    if (ids.every((id) => !used.has(id))) {
      const nu = new Set(used);
      ids.forEach((id) => nu.add(id));
      chosen.push(a);
      rec(i + 1, nu, chosen);
      chosen.pop();
    }
    rec(i + 1, used, chosen);
  };
  rec(0, new Set(), []);
  return best;
}

/**
 * All combinations a player may choose from (excludes belot; none in NT): every carre, every maximal run,
 * the sub-runs left when carre cards are removed from a run, and the members of the best non-overlapping set.
 * Entries may overlap — a manual declaration must pick a non-overlapping subset.
 */
export function detectAnnouncements(hand: Card[], contract: Contract): Announcement[] {
  if (contract.kind === 'NT') return [];
  const out = new Map<string, Announcement>();
  const add = (a: Announcement) => {
    if (!out.has(key(a))) out.set(key(a), a);
  };
  const cs = carres(hand);
  cs.forEach(add);
  const carreIds = new Set(cs.flatMap((c) => c.cards.map(cardId)));
  for (const run of maximalRuns(hand)) {
    add(makeSequence(run));
    let cur: Card[] = [];
    for (const c of [...run, null]) {
      if (c && !carreIds.has(cardId(c))) cur.push(c);
      else {
        if (cur.length >= 3) add(makeSequence(cur));
        cur = [];
      }
    }
  }
  bestAnnouncementSet(hand, contract).forEach(add);
  return [...out.values()].sort((a, b) => b.points - a.points || seqStrength(b) - seqStrength(a));
}

/** Validate and canonicalise manually declared combinations. Returns null if invalid. */
export function validateAnnouncements(
  hand: readonly Card[],
  contract: Contract,
  anns: readonly Announcement[],
): Announcement[] | null {
  if (anns.length === 0) return [];
  if (contract.kind === 'NT') return null;
  const used = new Set<string>();
  const out: Announcement[] = [];
  for (const a of anns) {
    if (!a || !Array.isArray(a.cards) || a.cards.length < 3) return null;
    for (const c of a.cards) {
      if (!c || !hasCard(hand, c)) return null;
      const id = cardId(c);
      if (used.has(id)) return null;
      used.add(id);
    }
    if (a.type === 'carre') {
      const rank = a.cards[0].rank;
      if (a.cards.length !== 4 || !CARRE_POINTS[rank] || a.cards.some((c) => c.rank !== rank)) return null;
      out.push(makeCarre(rank, a.cards));
    } else if (a.type === 'tierce' || a.type === 'quarte' || a.type === 'quint') {
      const sorted = sortSeq(a.cards);
      const suit = sorted[0].suit;
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].suit !== suit) return null;
        if (i > 0 && seqIndex(sorted[i].rank) !== seqIndex(sorted[i - 1].rank) + 1) return null;
      }
      const canon = makeSequence(sorted);
      if (canon.type !== a.type) return null;
      out.push(canon);
    } else return null;
  }
  return out;
}

/** Can playing `card` from `hand` (before removal) into `trick` declare belot? */
export function canDeclareBelot(hand: readonly Card[], card: Card, contract: Contract, trick: Trick | null): boolean {
  if (card.rank !== 'Q' && card.rank !== 'K') return false;
  if (!hasCard(hand, card)) return false;
  const other: Card = { suit: card.suit, rank: card.rank === 'Q' ? 'K' : 'Q' };
  if (!hasCard(hand, other)) return false;
  if (contract.kind === 'NT') return false;
  if (contract.kind === 'suit') return card.suit === contract.suit;
  const leading = !trick || trick.plays.length === 0;
  return leading || trick.plays[0].card.suit === card.suit;
}

function bestOf(list: Announcement[], cmp: (a: Announcement) => number): number {
  return list.length ? Math.max(...list.map(cmp)) : -1;
}

/**
 * Resolve declared announcements at round end.
 * Returns combination points (sequences + carres) and belot points per team, raw.
 */
export function resolveAnnouncements(
  declared: readonly { seat: Seat; announcement: Announcement }[],
): { combos: [number, number]; belot: [number, number] } {
  const combos: [number, number] = [0, 0];
  const belot: [number, number] = [0, 0];
  const seqs: [Announcement[], Announcement[]] = [[], []];
  const crs: [Announcement[], Announcement[]] = [[], []];
  for (const { seat, announcement: a } of declared) {
    const t = teamOf(seat);
    if (a.type === 'belot') belot[t] += a.points;
    else if (a.type === 'carre') crs[t].push(a);
    else seqs[t].push(a);
  }
  const award = (lists: [Announcement[], Announcement[]], cmp: (a: Announcement) => number) => {
    const b0 = bestOf(lists[0], cmp);
    const b1 = bestOf(lists[1], cmp);
    if (b0 === b1) return; // both none, or exact tie → cancelled
    const w = b0 > b1 ? 0 : 1;
    combos[w] += lists[w].reduce((s, a) => s + a.points, 0);
  };
  award(seqs, seqStrength);
  award(crs, (a) => a.points * 10 + seqIndex(a.highRank));
  return { combos, belot };
}
