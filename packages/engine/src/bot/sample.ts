/**
 * Determinization: sample a full deal of the unseen cards consistent with the public constraints
 * (hand sizes, known cards from declarations, inferred voids / obligations), mildly biased by soft signals.
 */
import { bitsOf, popcount } from './bits';
import type { Knowledge } from './knowledge';

function shuffleInPlace<T>(a: T[], rng: () => number) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
}

/** Returns 4 hand masks (mine = k.hand). Always returns a deal; constraints are dropped only if inconsistent. */
export function sampleDeal(k: Knowledge, rng: () => number): number[] {
  for (let attempt = 0; attempt < 24; attempt++) {
    const d = greedy(k, rng, true);
    if (d) return d;
  }
  return backtrack(k, rng) ?? greedy(k, rng, false)!;
}

function setup(k: Knowledge) {
  const deal = [0, 0, 0, 0];
  const cap = [0, 0, 0, 0];
  let fixedAll = 0;
  for (let s = 0; s < 4; s++) {
    if (s === k.me) {
      deal[s] = k.hand;
      continue;
    }
    deal[s] = k.fixed[s];
    fixedAll |= k.fixed[s];
    cap[s] = Math.max(0, k.counts[s] - popcount(k.fixed[s]));
  }
  return { deal, cap, rest: bitsOf(k.unseen & ~fixedAll) };
}

function greedy(k: Knowledge, rng: () => number, constrained: boolean): number[] | null {
  const { deal, cap, rest } = setup(k);
  shuffleInPlace(rest, rng);
  const others = [0, 1, 2, 3].filter((s) => s !== k.me);
  const elig = (b: number) => others.filter((s) => !constrained || ((k.forbidden[s] >>> b) & 1) === 0);
  const withE = rest.map((b) => ({ b, e: elig(b) }));
  withE.sort((x, y) => x.e.length - y.e.length);
  let slack = rest.length - (cap[0] + cap[1] + cap[2] + cap[3]); // > 0 only for malformed views
  for (const { b, e } of withE) {
    let total = 0;
    for (const s of e) if (cap[s] > 0) total += cap[s] * k.weights[s][b];
    if (total <= 0) {
      if (slack > 0) {
        slack--;
        continue;
      }
      return null;
    }
    let r = rng() * total;
    let pick = -1;
    for (const s of e) {
      if (cap[s] <= 0) continue;
      pick = s;
      r -= cap[s] * k.weights[s][b];
      if (r < 0) break;
    }
    deal[pick] |= 1 << b;
    cap[pick]--;
  }
  return deal;
}

/** Exact constrained assignment (unweighted), used when the greedy sampler keeps failing. */
function backtrack(k: Knowledge, rng: () => number): number[] | null {
  const { deal, cap, rest } = setup(k);
  if (rest.length !== cap[0] + cap[1] + cap[2] + cap[3]) return null;
  shuffleInPlace(rest, rng);
  const others = [0, 1, 2, 3].filter((s) => s !== k.me);
  const order = rest
    .map((b) => ({ b, e: others.filter((s) => ((k.forbidden[s] >>> b) & 1) === 0) }))
    .sort((x, y) => x.e.length - y.e.length);
  let nodes = 0;
  const rec = (i: number): boolean => {
    if (++nodes > 20000) return false;
    if (i === order.length) return true;
    const { b, e } = order[i];
    const start = Math.floor(rng() * e.length);
    for (let j = 0; j < e.length; j++) {
      const s = e[(start + j) % e.length];
      if (cap[s] <= 0) continue;
      cap[s]--;
      deal[s] |= 1 << b;
      if (rec(i + 1)) return true;
      deal[s] &= ~(1 << b);
      cap[s]++;
    }
    return false;
  };
  return rec(0) ? deal : null;
}
