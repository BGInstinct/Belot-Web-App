import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { computeSheet } from './scoring';
import type { FinishedMatch, RoundDraft, TrackerRound } from './types';

export const TRACKER_STORAGE_KEY = 'belot-tracker';

let idCounter = 0;
export function newId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface TrackerState {
  /** custom team names; empty string = use translated default */
  teamNames: [string, string];
  rounds: TrackerRound[];
  history: FinishedMatch[];
  /** id of the match winner the user already celebrated (to avoid re-showing after refresh) */
  celebratedMatchKey: string | null;

  setTeamName: (team: 0 | 1, name: string) => void;
  addRound: (round: RoundDraft) => string;
  updateRound: (id: string, round: RoundDraft) => void;
  deleteRound: (id: string) => void;
  undoLastRound: () => void;
  /** archives the current match into history (if it was won) and starts a fresh sheet */
  newMatch: (resolvedNames?: [string, string]) => void;
  clearHistory: () => void;
  setCelebrated: (key: string | null) => void;
}

const memoryStorage = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
};

export const useTrackerStore = create<TrackerState>()(
  persist(
    (set, get) => ({
      teamNames: ['', ''],
      rounds: [],
      history: [],
      celebratedMatchKey: null,

      setTeamName: (team, name) =>
        set((s) => {
          const teamNames: [string, string] = [...s.teamNames];
          teamNames[team] = name.slice(0, 24);
          return { teamNames };
        }),

      addRound: (round) => {
        const id = newId();
        set((s) => ({ rounds: [...s.rounds, { ...round, id } as TrackerRound] }));
        return id;
      },

      updateRound: (id, round) =>
        set((s) => ({ rounds: s.rounds.map((r) => (r.id === id ? ({ ...round, id } as TrackerRound) : r)) })),

      deleteRound: (id) => set((s) => ({ rounds: s.rounds.filter((r) => r.id !== id) })),

      undoLastRound: () => set((s) => ({ rounds: s.rounds.slice(0, -1) })),

      newMatch: (resolvedNames) => {
        const { rounds, teamNames, history } = get();
        const sheet = computeSheet(rounds);
        const nextHistory =
          sheet.winner !== null
            ? [
                {
                  id: newId(),
                  finishedAt: Date.now(),
                  teamNames: resolvedNames ?? teamNames,
                  totals: sheet.totals,
                  winner: sheet.winner,
                  rounds: (sheet.winnerRoundIndex ?? rounds.length - 1) + 1,
                },
                ...history,
              ].slice(0, 50)
            : history;
        set({ rounds: [], history: nextHistory, celebratedMatchKey: null });
      },

      clearHistory: () => set({ history: [] }),
      setCelebrated: (key) => set({ celebratedMatchKey: key }),
    }),
    {
      name: TRACKER_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => (typeof localStorage !== 'undefined' ? localStorage : memoryStorage())),
      partialize: (s) => ({
        teamNames: s.teamNames,
        rounds: s.rounds,
        history: s.history,
        celebratedMatchKey: s.celebratedMatchKey,
      }),
    },
  ),
);
