import { beforeEach, describe, expect, it } from 'vitest';
import { useTrackerStore } from './store';
import { computeSheet } from './scoring';

const reset = () =>
  useTrackerStore.setState({ teamNames: ['', ''], rounds: [], history: [], celebratedMatchKey: null });

describe('tracker store', () => {
  beforeEach(reset);

  it('adds, edits, deletes and undoes rounds; sheet is recomputed from history', () => {
    const s = useTrackerStore.getState();
    const id1 = s.addRound({ kind: 'quick', recorded: [10, 6], hangingAfter: 0, capo: false });
    const id2 = s.addRound({ kind: 'quick', recorded: [4, 12], hangingAfter: 0, capo: false });
    expect(computeSheet(useTrackerStore.getState().rounds).totals).toEqual([14, 18]);

    useTrackerStore.getState().updateRound(id1, { kind: 'quick', recorded: [20, 0], hangingAfter: 0, capo: false });
    expect(computeSheet(useTrackerStore.getState().rounds).totals).toEqual([24, 12]);
    expect(useTrackerStore.getState().rounds[0].id).toBe(id1);

    useTrackerStore.getState().deleteRound(id1);
    expect(useTrackerStore.getState().rounds.map((r) => r.id)).toEqual([id2]);

    useTrackerStore.getState().undoLastRound();
    expect(useTrackerStore.getState().rounds).toEqual([]);
  });

  it('archives a won match into history on new match', () => {
    const s = useTrackerStore.getState();
    s.setTeamName(0, 'Alpha');
    s.addRound({ kind: 'quick', recorded: [151, 40], hangingAfter: 0, capo: false });
    useTrackerStore.getState().newMatch(['Alpha', 'Вие']);
    const st = useTrackerStore.getState();
    expect(st.rounds).toEqual([]);
    expect(st.teamNames[0]).toBe('Alpha');
    expect(st.history).toHaveLength(1);
    expect(st.history[0]).toMatchObject({ winner: 0, totals: [151, 40], teamNames: ['Alpha', 'Вие'], rounds: 1 });
  });

  it('does not archive a match whose last round left points hanging', () => {
    useTrackerStore.getState().addRound({ kind: 'quick', recorded: [151, 40], hangingAfter: 6, capo: false });
    useTrackerStore.getState().newMatch();
    expect(useTrackerStore.getState().history).toEqual([]);
  });

  it('does not archive an unfinished match', () => {
    useTrackerStore.getState().addRound({ kind: 'allPass' });
    useTrackerStore.getState().newMatch();
    expect(useTrackerStore.getState().history).toEqual([]);
    expect(useTrackerStore.getState().rounds).toEqual([]);
  });
});
