/**
 * SHARED CONTRACT — Socket.io protocol between client and server.
 * All client→server events use acknowledgements: callback(AckResult).
 */
import type { GameAction, GameEvent, PlayerView, RoomSettings, Seat } from './types';

export interface PlayerProfile {
  /** stable id: Supabase user id, or a generated guest id persisted in localStorage */
  id: string;
  name: string;
  avatar?: string;
  isGuest: boolean;
  /** equipped cosmetics (skin ids from /assets/skins/manifest.json) */
  cardSkin?: string;
  cardBack?: string;
}

export interface SeatInfo {
  seat: Seat;
  player: PlayerProfile | null;
  isBot: boolean;
  connected: boolean;
}

export interface RoomView {
  code: string; // 6 chars, uppercase A-Z0-9 without ambiguous chars (0/O/1/I)
  hostId: string;
  settings: RoomSettings;
  seats: [SeatInfo, SeatInfo, SeatInfo, SeatInfo];
  status: 'lobby' | 'playing' | 'finished';
  /** epoch ms when the current turn times out; null if no timer running (or while paused) */
  turnDeadline: number | null;
  /**
   * Host pause. While paused: no timers run, bots/AFK auto-play don't act, game actions are rejected
   * with 'GAME_PAUSED'. `pausedRemainingMs` is how much turn time is left (to show a frozen timer bar).
   */
  paused: boolean;
  pausedRemainingMs: number | null;
  /**
   * Seats whose human timed out and are now auto-played by the bot. The human gets control back
   * (from their next turn on) after sending 'game:imBack'.
   */
  afkSeats: Seat[];
  /**
   * Round-end ready-up. Non-null while a finished round is waiting for players to press Continue
   * (phase 'roundEnd'). Bots, AFK and disconnected seats count as ready automatically.
   * The next round deals when every seat is ready, or at `deadline` (players still not ready then are marked AFK).
   */
  roundReady: { readySeats: Seat[]; deadline: number } | null;
}

/** `playerId` is the id the server actually uses for you (a verified Supabase id replaces the guest id). */
export interface JoinResult {
  code: string;
  playerId: string;
}

export type AckResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export interface ClientToServerEvents {
  /** auth token is optional (Supabase access token); server falls back to the profile as a guest */
  'room:create': (p: { settings: RoomSettings; profile: PlayerProfile; token?: string }, ack: (r: AckResult<JoinResult>) => void) => void;
  'room:join': (p: { code: string; profile: PlayerProfile; token?: string }, ack: (r: AckResult<JoinResult>) => void) => void;
  'room:sit': (p: { seat: Seat }, ack: (r: AckResult) => void) => void;
  'room:addBot': (p: { seat: Seat }, ack: (r: AckResult) => void) => void;
  'room:removeBot': (p: { seat: Seat }, ack: (r: AckResult) => void) => void;
  'room:updateSettings': (p: { settings: RoomSettings }, ack: (r: AckResult) => void) => void;
  'room:start': (p: Record<string, never>, ack: (r: AckResult) => void) => void;
  'room:leave': (p: Record<string, never>, ack: (r: AckResult) => void) => void;
  'game:action': (p: { action: GameAction }, ack: (r: AckResult) => void) => void;
  /** host only, while status === 'playing' */
  'room:pause': (p: { paused: boolean }, ack: (r: AckResult) => void) => void;
  /** AFK player takes control back (from their next turn) */
  'game:imBack': (p: Record<string, never>, ack: (r: AckResult) => void) => void;
  /** round-end "Continue" (ready for next deal) */
  'game:ready': (p: Record<string, never>, ack: (r: AckResult) => void) => void;
  'chat:send': (p: { text: string }, ack: (r: AckResult) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (room: RoomView) => void;
  /** personalised view; sent after every state change */
  'game:state': (view: PlayerView) => void;
  'game:events': (events: GameEvent[]) => void;
  'chat:message': (m: { from: string; text: string; at: number }) => void;
  'room:closed': (reason: string) => void;
}
