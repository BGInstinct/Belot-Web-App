/**
 * Hard tier card play: determinized sampling (perfect-information Monte Carlo).
 * For N deals of the unseen cards consistent with public constraints (see knowledge.ts / sample.ts), each
 * distinct legal card is evaluated by
 *  - an exact alpha-beta search of the remaining tricks when ≤ EXACT_TRICKS tricks remain, or
 *  - a greedy perfect-information rollout of the rest of the round otherwise,
 * scored as the expected round outcome (see search.ts finalValue). The best average wins; ties → cheapest card.
 * Deterministic for a given rng. Cost is bounded by sample counts and a per-sample node budget.
 */
import type { Card, PlayerView } from '../types';
import { cheapKey, fromBit, maskOf } from './bits';
import { buildKnowledge } from './knowledge';
import { sampleDeal } from './sample';
import { BudgetExceeded, baseState, cloneState, distinctMoves, makeCtx, playBit, rollout, solve, type Solver } from './search';

export const HARD_PARAMS = {
  samplesRollout: 28,
  samplesExact: 20,
  exactTricks: 4,
  nodeBudget: 6000,
};

export function hardCard(view: PlayerView, rng: () => number): Card {
  const k = buildKnowledge(view);
  const enc = k.enc;
  const legal = maskOf(enc, view.legalCards);
  if ((legal & (legal - 1)) === 0) return view.legalCards[0];
  let inPlay = k.unseen | k.hand;
  for (const p of k.plays) inPlay |= 1 << p;
  const moves = distinctMoves(enc, inPlay, legal);
  if (moves.length === 1) return fromBit(enc, moves[0]);
  const exact = 8 - k.tricksDone <= HARD_PARAMS.exactTricks;
  const n = exact ? HARD_PARAMS.samplesExact : HARD_PARAMS.samplesRollout;
  const sums = new Array<number>(moves.length).fill(0);
  const vals = new Array<number>(moves.length).fill(0);
  for (let i = 0; i < n; i++) {
    const deal = sampleDeal(k, rng);
    const ctx = makeCtx(k, view.contract!, deal);
    const base = baseState(k, deal);
    let done = false;
    if (exact) {
      const sv: Solver = { ctx, tt: new Map(), nodes: 0, budget: HARD_PARAMS.nodeBudget };
      try {
        for (let j = 0; j < moves.length; j++) {
          const st = cloneState(base);
          playBit(enc, st, k.me, moves[j]);
          vals[j] = solve(sv, st, -Infinity, Infinity);
        }
        done = true;
      } catch (e) {
        if (!(e instanceof BudgetExceeded)) throw e;
      }
    }
    if (!done) {
      for (let j = 0; j < moves.length; j++) {
        const st = cloneState(base);
        playBit(enc, st, k.me, moves[j]);
        vals[j] = rollout(ctx, st);
      }
    }
    for (let j = 0; j < moves.length; j++) sums[j] += vals[j];
  }
  let best = 0;
  for (let j = 1; j < moves.length; j++) {
    const d = sums[j] - sums[best];
    if (d > 1e-9 || (Math.abs(d) <= 1e-9 && cheapKey(enc, moves[j]) < cheapKey(enc, moves[best]))) best = j;
  }
  return fromBit(enc, moves[best]);
}
