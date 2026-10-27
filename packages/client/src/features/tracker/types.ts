import type { Contract, Multiplier, RoundOutcome, Team } from '@belot/engine';

export type { Contract, Multiplier, RoundOutcome, Team };

/** Announcement chips a player can add in the tracker (already resolved: only those that count). */
export type AnnouncementChip = 'tierce' | 'quarte' | 'quint' | 'carre100' | 'carre150' | 'carre200';

export const CHIP_POINTS: Record<AnnouncementChip, number> = {
  tierce: 20,
  quarte: 50,
  quint: 100,
  carre100: 100,
  carre150: 150,
  carre200: 200,
};

export const CHIPS: AnnouncementChip[] = ['tierce', 'quarte', 'quint', 'carre100', 'carre150', 'carre200'];

export const BELOT_POINTS = 20;
export const MATCH_TARGET = 151;

/** A fully described round: scoring math is done by the engine. */
export interface FullRound {
  kind: 'full';
  id: string;
  contract: Contract;
  declarerTeam: Team;
  multiplier: Multiplier;
  /** raw trick points per team incl. last 10 (NOT doubled for NT) */
  trickPoints: [number, number];
  /** which team took the last trick (UI convenience only; already included in trickPoints) */
  lastTenTeam: Team;
  announcements: [AnnouncementChip[], AnnouncementChip[]];
  /** number of belots declared per team */
  belots: [number, number];
  capoTeam: Team | null;
}

/** All four players passed — nothing scored, hanging points carry over. */
export interface AllPassRound {
  kind: 'allPass';
  id: string;
}

/** Already-converted points typed in by hand. */
export interface QuickRound {
  kind: 'quick';
  id: string;
  recorded: [number, number];
  /** points left hanging after this round (default 0) */
  hangingAfter: number;
  /** marks the round as a capo (the match cannot be finished on it) */
  capo: boolean;
}

export type TrackerRound = FullRound | AllPassRound | QuickRound;
export type RoundDraft = Omit<FullRound, 'id'> | Omit<AllPassRound, 'id'> | Omit<QuickRound, 'id'>;

export interface SheetRow {
  round: TrackerRound;
  index: number;
  outcome: RoundOutcome;
  recorded: [number, number];
  hangingBefore: number;
  hangingAfter: number;
  /** running totals after this round */
  totals: [number, number];
  /** true for rows entered after the match had already been won (e.g. after an edit) */
  afterMatchEnd: boolean;
  error?: string;
}

export interface SheetResult {
  rows: SheetRow[];
  totals: [number, number];
  hanging: number;
  winner: Team | null;
  /** index of the round on which the match was won */
  winnerRoundIndex: number | null;
  /** a team reached the target but the last round left points hanging, so the match can't finish yet */
  hangingBlocksFinish: boolean;
}

export interface FinishedMatch {
  id: string;
  finishedAt: number;
  teamNames: [string, string];
  totals: [number, number];
  winner: Team;
  rounds: number;
}
