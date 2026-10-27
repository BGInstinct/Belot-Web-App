/**
 * SHARED CONTRACT — engine, server and client all depend on these types.
 * Do not change existing shapes without coordinating; adding optional fields is fine.
 *
 * Seats are 0..3. "Next player" (counter-clockwise / to the right) is (seat + 1) % 4.
 * Teams: seats 0 & 2 are team 0, seats 1 & 3 are team 1  →  team = seat % 2.
 */

export type Suit = 'C' | 'D' | 'H' | 'S';
export type Rank = '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';
export type Seat = 0 | 1 | 2 | 3;
export type Team = 0 | 1;

export interface Card {
  suit: Suit;
  rank: Rank;
}

/** Contract ranking (ascending): C < D < H < S < NT < AT. */
export type Contract =
  | { kind: 'suit'; suit: Suit }
  | { kind: 'NT' }
  | { kind: 'AT' };

export type Bid =
  | { kind: 'pass' }
  | { kind: 'contract'; contract: Contract }
  | { kind: 'contra' }
  | { kind: 'recontra' };

/** 1 = normal, 2 = contra, 4 = recontra */
export type Multiplier = 1 | 2 | 4;

export interface RoomSettings {
  /**
   * true  ("official/strict"): follow suit; when the led suit is trump (or in All Trumps) you must beat the
   *        highest card of that suit if you can; if void and an opponent holds the trick you must trump,
   *        overtrumping if a trump is already on the table and you can. Partner-holding exemption applies
   *        only to the void→trump obligation.
   * false ("relaxed"): only following suit is mandatory; if void and an opponent holds the trick in a suit
   *        game you must play a trump (any trump, no overtrump obligation). No obligation to beat in AT
   *        or when trump is led.
   */
  forceHigherCardPlacement: boolean;
  /** true → nothing is auto-declared; players must send announcements/belot with their play action. */
  manualAnnounceOnly: boolean;
  turnTimerSeconds: 15 | 30 | 45 | 60;
  /** skill of server-side bots (and of the auto-player for AFK/timed-out seats) */
  botDifficulty: BotDifficulty;
}

/**
 * easy   – random legal cards with basic rule adherence; misses tactics.
 * medium – standard follow/trump strategy, tracks high cards, sensible plays.
 * hard   – card counting, void/partner-signal inference, sampling-based trick optimisation.
 * ALL tiers decide from public information only (see BotView) — never other hands or the stock.
 */
export type BotDifficulty = 'easy' | 'medium' | 'hard';

export const DEFAULT_SETTINGS: RoomSettings = {
  forceHigherCardPlacement: true,
  manualAnnounceOnly: false,
  turnTimerSeconds: 30,
  botDifficulty: 'medium',
};

export type AnnouncementType =
  | 'tierce' // 3 in a row, 20
  | 'quarte' // 4 in a row, 50
  | 'quint' // 5+ in a row, 100
  | 'carre' // four of a kind: 10/Q/K/A 100, 9s 150, Js 200
  | 'belot'; // Q+K of trump (any suit in AT), 20

export interface Announcement {
  type: AnnouncementType;
  /** the cards forming the combination */
  cards: Card[];
  points: number;
  /** highest card rank of the sequence (sequence order 7<8<9<10<J<Q<K<A); rank of carre */
  highRank: Rank;
  suit?: Suit; // for sequences / belot
}

export type Phase =
  | 'bidding'
  | 'playing'
  | 'roundEnd' // round scored, waiting for next round (server calls startNextRound)
  | 'matchEnd';

export interface TrickPlay {
  seat: Seat;
  card: Card;
}

export interface Trick {
  leader: Seat;
  plays: TrickPlay[];
  winner?: Seat;
}

export interface BidRecord {
  seat: Seat;
  bid: Bid;
}

export type RoundOutcome = 'made' | 'failed' | 'hanging' | 'allPass';

export interface RoundResult {
  contract: Contract | null;
  declarerTeam: Team | null;
  multiplier: Multiplier;
  outcome: RoundOutcome;
  /** raw card points from tricks incl. last-10, NT already doubled */
  trickPoints: [number, number];
  /** accepted announcement points per team (raw, before /10) incl. belot */
  announcementPoints: [number, number];
  capoTeam: Team | null;
  /** final recorded (divided-by-10, rounded, multiplied) points added to the match score */
  recorded: [number, number];
  /** points left hanging after this round (to be awarded to winner of next round) */
  hangingAfter: number;
  /** set when the round was ended by a Claim All */
  claim?: ClaimInfo | null;
}

/**
 * "Claim All" (Прибиране): a player on turn during play declares their team takes every remaining trick.
 * The engine verifies it with an exhaustive search over the actual hands: the claim succeeds only if the
 * claiming team can force every remaining trick against ANY legal opponent play.
 *  - success → remaining tricks are played out along a winning line and awarded to the claiming team;
 *  - failure → penalty: all remaining tricks (and their cards) are awarded to the opponents.
 * Either way the claimer's remaining hand is revealed to everyone and the round is scored immediately.
 */
export interface ClaimInfo {
  seat: Seat;
  success: boolean;
  /** claimer's remaining hand at the moment of the claim */
  revealed: Card[];
  /** number of tricks (incl. the one in progress) that were resolved by the claim */
  tricksClaimed: number;
}

export interface MatchState {
  settings: RoomSettings;
  phase: Phase;
  dealer: Seat;
  /** whose turn it is (bidding or playing); null when not applicable */
  turn: Seat | null;
  hands: [Card[], Card[], Card[], Card[]];
  /** undealt cards (the 12 held back during bidding) */
  stock: Card[];
  bids: BidRecord[];
  contract: Contract | null;
  declarer: Seat | null;
  multiplier: Multiplier;
  tricks: Trick[]; // completed tricks this round
  currentTrick: Trick | null;
  /** announcements declared this round (per seat). Resolution (which count) happens at round end. */
  declared: { seat: Seat; announcement: Announcement }[];
  /** seats that already played their first card this round (announcement window closed) */
  playedFirstCard: Seat[];
  score: [number, number];
  hanging: number;
  roundHistory: RoundResult[];
  roundNumber: number;
  winner: Team | null;
  /** Claim All of the current round (null/undefined if none) */
  claim?: ClaimInfo | null;
}

/** Actions a seat may submit. */
export type GameAction =
  | { type: 'bid'; bid: Bid }
  | {
      type: 'play';
      card: Card;
      /**
       * Only used when settings.manualAnnounceOnly === true (ignored otherwise; engine auto-declares).
       * Combinations the player chooses to declare with their FIRST card. Engine validates against the hand.
       */
      announcements?: Announcement[];
      /** declare Belot with this card (must be Q or K of a trump suit while still holding the other). */
      belot?: boolean;
    }
  /** Claim All — only during 'playing' on your own turn. See ClaimInfo. */
  | { type: 'claim' };

/** Emitted by applyAction so the server/client can animate & log. */
export type GameEvent =
  | { type: 'bid'; seat: Seat; bid: Bid }
  | { type: 'biddingEnded'; contract: Contract | null; declarer: Seat | null; multiplier: Multiplier }
  | { type: 'dealtRest' }
  | { type: 'cardPlayed'; seat: Seat; card: Card }
  | { type: 'announced'; seat: Seat; announcement: Announcement }
  | { type: 'trickWon'; seat: Seat; trick: Trick }
  | { type: 'roundEnded'; result: RoundResult }
  | { type: 'claimed'; claim: ClaimInfo; tricks: Trick[] }
  | { type: 'matchEnded'; winner: Team };

/** What a single seat is allowed to see. Opponents' hands are hidden. */
export interface PlayerView {
  seat: Seat | null; // null for spectators
  settings: RoomSettings;
  phase: Phase;
  dealer: Seat;
  turn: Seat | null;
  hand: Card[];
  handCounts: [number, number, number, number];
  bids: BidRecord[];
  contract: Contract | null;
  declarer: Seat | null;
  multiplier: Multiplier;
  currentTrick: Trick | null;
  lastTrick: Trick | null;
  tricksWon: [number, number]; // per team
  declared: { seat: Seat; announcement: Announcement }[];
  score: [number, number];
  hanging: number;
  roundHistory: RoundResult[];
  roundNumber: number;
  winner: Team | null;
  /** for the seat to act: legal cards (playing) */
  legalCards: Card[];
  /** for the seat to act: legal bids (bidding) */
  legalBids: Bid[];
  /** for the seat to act on their first card: combinations available to declare (manual mode UI) */
  availableAnnouncements: Announcement[];
  /** Claim All of the current round, with the claimer's revealed hand (visible to everyone) */
  claim?: ClaimInfo | null;
  /** all completed tricks of the current round, in order (public information; used for card counting) */
  playedTricks?: Trick[];
  /** whether the seat to act may press Claim All right now (on turn, phase 'playing') — NOT whether it would succeed */
  canClaim?: boolean;
}

/** Manual score input — used by the Physical Score Tracker and internally by the engine. */
export interface ScoreInput {
  contract: Contract;
  declarerTeam: Team;
  multiplier: Multiplier;
  /** raw trick points per team including last 10 (NOT yet doubled for NT — engine doubles) */
  trickPoints: [number, number];
  /** raw announcement points per team (tierce/quarte/quint/carre), already resolved */
  announcementPoints: [number, number];
  /** raw belot points per team (20 per belot) */
  belotPoints: [number, number];
  capoTeam: Team | null;
  /** points hanging from previous round */
  hangingBefore: number;
}

export interface ScoreOutput {
  outcome: Exclude<RoundOutcome, 'allPass'>;
  recorded: [number, number];
  hangingAfter: number;
}

export class EngineError extends Error {
  constructor(
    public code:
      | 'NOT_YOUR_TURN'
      | 'WRONG_PHASE'
      | 'ILLEGAL_BID'
      | 'ILLEGAL_CARD'
      | 'CARD_NOT_IN_HAND'
      | 'INVALID_ANNOUNCEMENT',
    message?: string,
  ) {
    super(message ?? code);
  }
}
