/**
 * Pure tracker logic: turns the round history into a score sheet.
 * All Belot scoring math is delegated to @belot/engine (single source of truth).
 */
import { checkMatchWinner, computeRoundScore, WIN_THRESHOLD } from '@belot/engine';
import type { Contract, ScoreInput, ScoreOutput, Team } from '@belot/engine';
import { BELOT_POINTS, CHIP_POINTS } from './types';
import type { FullRound, RoundOutcome, SheetResult, SheetRow, TrackerRound } from './types';

/** Raw trick total (incl. last 10) for a contract, before the NT doubling (done by the engine). */
export function modeTotal(contract: Contract): number {
  if (contract.kind === 'AT') return 258;
  if (contract.kind === 'NT') return 130;
  return 162;
}

/** Max number of belots that can exist in a contract (none in NT, one in a suit game, four in AT). */
export function maxBelots(contract: Contract): number {
  if (contract.kind === 'NT') return 0;
  if (contract.kind === 'AT') return 4;
  return 1;
}

export function announcementsAllowed(contract: Contract): boolean {
  return contract.kind !== 'NT';
}

export function sumChips(chips: readonly (keyof typeof CHIP_POINTS)[]): number {
  return chips.reduce((s, c) => s + CHIP_POINTS[c], 0);
}

/** Validation errors (i18n keys) for a full round draft. Empty array = valid. */
export function validateFullRound(r: Omit<FullRound, 'id'>): string[] {
  const errors: string[] = [];
  const total = modeTotal(r.contract);
  const [a, b] = r.trickPoints;
  if (![a, b].every((p) => Number.isInteger(p) && p >= 0 && p <= total)) errors.push('errors.pointsRange');
  else if (a + b !== total) errors.push('errors.pointsSum');
  if (r.capoTeam !== null && r.trickPoints[r.capoTeam] !== total) errors.push('errors.capoPoints');
  if (r.capoTeam === null && r.trickPoints[r.lastTenTeam] < 10) errors.push('errors.lastTen');
  const maxB = maxBelots(r.contract);
  if (r.belots[0] + r.belots[1] > maxB || r.belots.some((b) => b < 0)) errors.push('errors.belots');
  if (!announcementsAllowed(r.contract) && (r.announcements[0].length || r.announcements[1].length))
    errors.push('errors.noAnnouncementsNT');
  return errors;
}

export function buildScoreInput(r: Omit<FullRound, 'id'>, hangingBefore: number): ScoreInput {
  const nt = !announcementsAllowed(r.contract);
  return {
    contract: r.contract,
    declarerTeam: r.declarerTeam,
    multiplier: r.multiplier,
    trickPoints: [r.trickPoints[0], r.trickPoints[1]],
    announcementPoints: nt ? [0, 0] : [sumChips(r.announcements[0]), sumChips(r.announcements[1])],
    belotPoints: nt ? [0, 0] : [r.belots[0] * BELOT_POINTS, r.belots[1] * BELOT_POINTS],
    capoTeam: r.capoTeam,
    hangingBefore,
  };
}

/** Safe wrapper around the engine (it may throw, e.g. while not implemented yet). */
export function scoreFullRound(
  r: Omit<FullRound, 'id'>,
  hangingBefore: number,
): { ok: true; result: ScoreOutput } | { ok: false; error: string } {
  try {
    return { ok: true, result: computeRoundScore(buildScoreInput(r, hangingBefore)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function roundCapoTeam(r: TrackerRound): Team | null {
  if (r.kind === 'full') return r.capoTeam;
  if (r.kind === 'quick') return r.capo ? 0 : null;
  return null;
}

function safeWinner(score: [number, number], outcome: RoundOutcome, capoTeam: Team | null, hangingAfter: number): Team | null {
  try {
    // a round that leaves points hanging cannot finish the match
    return checkMatchWinner(score, { outcome, capoTeam, hangingAfter });
  } catch {
    return null;
  }
}

/** Recompute the whole sheet from the round history. */
export function computeSheet(rounds: readonly TrackerRound[]): SheetResult {
  const rows: SheetRow[] = [];
  let totals: [number, number] = [0, 0];
  let hanging = 0;
  let winner: Team | null = null;
  let winnerRoundIndex: number | null = null;
  let hangingBlocksFinish = false;

  rounds.forEach((round, index) => {
    const hangingBefore = hanging;
    let outcome: RoundOutcome;
    let recorded: [number, number] = [0, 0];
    let hangingAfter = hangingBefore;
    let error: string | undefined;

    if (round.kind === 'allPass') {
      outcome = 'allPass';
    } else if (round.kind === 'quick') {
      outcome = 'made';
      recorded = [round.recorded[0], round.recorded[1]];
      hangingAfter = round.hangingAfter;
    } else {
      const res = scoreFullRound(round, hangingBefore);
      if (res.ok) {
        outcome = res.result.outcome;
        recorded = [res.result.recorded[0], res.result.recorded[1]];
        hangingAfter = res.result.hangingAfter;
      } else {
        outcome = 'made';
        error = res.error;
      }
    }

    const afterMatchEnd = winner !== null;
    if (!afterMatchEnd) {
      totals = [totals[0] + recorded[0], totals[1] + recorded[1]];
      hanging = hangingAfter;
      const w = safeWinner(totals, outcome, roundCapoTeam(round), hangingAfter);
      if (w !== null) {
        winner = w;
        winnerRoundIndex = index;
      }
      // a team is past the target, but this round left points hanging → the match goes on
      hangingBlocksFinish =
        w === null && hangingAfter > 0 && Math.max(totals[0], totals[1]) >= WIN_THRESHOLD && totals[0] !== totals[1];
    }

    rows.push({ round, index, outcome, recorded, hangingBefore, hangingAfter, totals: [...totals], afterMatchEnd, error });
  });

  return { rows, totals, hanging, winner, winnerRoundIndex, hangingBlocksFinish };
}
