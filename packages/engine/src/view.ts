import { detectAnnouncements } from './announcements';
import { teamOf } from './cards';
import { getLegalBids, getLegalCards } from './game';
import type { MatchState, PlayerView, Seat } from './types';

/** Personalised view: own hand only (spectators see none), plus legal options for the seat to act. */
export function getPlayerView(state: MatchState, seat: Seat | null): PlayerView {
  const s: MatchState = JSON.parse(JSON.stringify(state));
  const tricksWon: [number, number] = [0, 0];
  for (const t of s.tricks) if (t.winner !== undefined) tricksWon[teamOf(t.winner)]++;
  const toAct = seat !== null && s.turn === seat;
  const canAnnounce =
    toAct && s.phase === 'playing' && !!s.contract && !s.playedFirstCard.includes(seat as Seat);
  return {
    seat,
    settings: s.settings,
    phase: s.phase,
    dealer: s.dealer,
    turn: s.turn,
    hand: seat === null ? [] : s.hands[seat],
    handCounts: [s.hands[0].length, s.hands[1].length, s.hands[2].length, s.hands[3].length],
    bids: s.bids,
    contract: s.contract,
    declarer: s.declarer,
    multiplier: s.multiplier,
    currentTrick: s.currentTrick,
    lastTrick: s.tricks.length ? s.tricks[s.tricks.length - 1] : null,
    tricksWon,
    declared: s.declared,
    score: s.score,
    hanging: s.hanging,
    roundHistory: s.roundHistory,
    roundNumber: s.roundNumber,
    winner: s.winner,
    legalCards: seat === null ? [] : getLegalCards(s, seat),
    legalBids: seat === null ? [] : getLegalBids(s, seat),
    availableAnnouncements: canAnnounce ? detectAnnouncements(s.hands[seat as Seat], s.contract!) : [],
    claim: s.claim ?? null,
    playedTricks: s.tricks,
    canClaim: toAct && s.phase === 'playing' && !!s.contract,
  };
}
