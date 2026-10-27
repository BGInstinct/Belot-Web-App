import type { Contract, ScoreInput, ScoreOutput, Team } from './types';

/**
 * Rounding (raw → recorded, ÷10). Announcements/belot/capo are multiples of 10 so only trick points
 * determine the last digit.
 * - Suit game: last digit ≥ 6 rounds up, ≤ 5 rounds down (keeps the 162-point game at 16 total).
 *   Special case: both teams end in 6 (e.g. 86/76) → the team with fewer raw trick points rounds down.
 * - All Trumps: last digit ≥ 5 rounds up (keeps 258 at 26). Special case: both end in 4 (e.g. 124/134)
 *   → the team with fewer raw trick points rounds up.
 * - No Trumps: (doubled points, always even) last digit ≥ 5 rounds up (keeps 260 at 26).
 * - Hanging round: in the special cases above the extra point goes to the hanging (declarer) side, i.e.
 *   "hanging points round up" (e.g. AT 154–154 → 15 to the defenders, 16 hang).
 * Sum of the two rounded trick parts therefore always equals 16 / 26 / 26.
 */
export function roundPair(
  raw: [number, number],
  tricks: [number, number],
  kind: Contract['kind'],
  favored?: Team,
): [number, number] {
  const threshold = kind === 'suit' ? 6 : 5;
  const r = (x: number) => Math.floor(x / 10) + (x % 10 >= threshold ? 1 : 0);
  const out: [number, number] = [r(raw[0]), r(raw[1])];
  const d0 = raw[0] % 10;
  const d1 = raw[1] % 10;
  const fewer: Team = tricks[0] < tricks[1] ? 0 : 1;
  if (kind === 'suit' && d0 === 6 && d1 === 6) {
    const down: Team = favored !== undefined ? ((1 - favored) as Team) : fewer;
    out[down] -= 1;
  } else if (kind === 'AT' && d0 === 4 && d1 === 4) {
    const up: Team = favored !== undefined ? favored : fewer;
    out[up] += 1;
  }
  return out;
}

/**
 * Round scoring.
 * - NT trick points (incl. last 10) are doubled; the capo bonus (90) is not.
 * - Raw totals = tricks + announcements + belot + capo. Declarers > defenders → made; < → failed; = → hanging.
 * - Made ×1: each team records its own points (+ previous hanging to declarers).
 * - Failed: defenders record everything ×multiplier (+ previous hanging).
 * - Made under contra/recontra: declarers record everything ×multiplier (+ previous hanging).
 * - Hanging ×1: defenders record their points; declarers' points join the hanging pot.
 * - Hanging under contra/recontra: nobody records; everything ×multiplier joins the hanging pot.
 * The hanging pot goes to the winner of the next decided round (made → declarers, failed → defenders).
 */
export function computeRoundScore(input: ScoreInput): ScoreOutput {
  const kind = input.contract.kind;
  const d = input.declarerTeam;
  const o = (1 - d) as Team;
  const tp: [number, number] = kind === 'NT' ? [input.trickPoints[0] * 2, input.trickPoints[1] * 2] : [...input.trickPoints];
  const raw: [number, number] = [0, 1].map(
    (t) => tp[t] + input.announcementPoints[t] + input.belotPoints[t] + (input.capoTeam === t ? 90 : 0),
  ) as [number, number];
  const outcome = raw[d] > raw[o] ? 'made' : raw[d] < raw[o] ? 'failed' : 'hanging';
  const rounded = roundPair(raw, tp, kind, outcome === 'hanging' ? d : undefined);
  const total = rounded[0] + rounded[1];
  const mult = input.multiplier;
  const recorded: [number, number] = [0, 0];
  let hangingAfter = 0;
  if (outcome === 'made') {
    if (mult === 1) {
      recorded[0] = rounded[0];
      recorded[1] = rounded[1];
    } else recorded[d] = total * mult;
    recorded[d] += input.hangingBefore;
  } else if (outcome === 'failed') {
    recorded[o] = total * mult + input.hangingBefore;
  } else if (mult === 1) {
    recorded[o] = rounded[o];
    hangingAfter = input.hangingBefore + rounded[d];
  } else {
    hangingAfter = input.hangingBefore + total * mult;
  }
  return { outcome, recorded, hangingAfter };
}

export const WIN_THRESHOLD = 151;

/**
 * First team to 151+ wins; if both are 151+ the higher score wins (equal → keep playing).
 * No winner can be declared on a capo round, an all-pass round, or a round that leaves points hanging
 * (`hangingAfter > 0` — the hanging pot must be resolved by a later decided round first).
 */
export function checkMatchWinner(
  score: [number, number],
  lastRound: { outcome: string; capoTeam: 0 | 1 | null; hangingAfter?: number },
): 0 | 1 | null {
  if (lastRound.outcome === 'allPass' || lastRound.capoTeam !== null) return null;
  if ((lastRound.hangingAfter ?? 0) > 0 || lastRound.outcome === 'hanging') return null;
  const [a, b] = score;
  if (a < WIN_THRESHOLD && b < WIN_THRESHOLD) return null;
  if (a === b) return null;
  return a > b ? 0 : 1;
}
