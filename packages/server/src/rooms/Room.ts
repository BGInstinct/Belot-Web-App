import {
  applyAction,
  chooseAutoAction,
  createMatch,
  EngineError,
  getPlayerView,
  startNextRound,
  type GameAction,
  type GameEvent,
  type MatchState,
  type PlayerProfile,
  type RoomSettings,
  type RoomView,
  type Seat,
  type SeatInfo,
  type ServerToClientEvents,
} from '@belot/engine';
import type { GameTiming } from '../config';

/** A single server→client message as a tuple: [event, ...args]. */
export type ServerMessage = {
  [E in keyof ServerToClientEvents]: [E, ...Parameters<ServerToClientEvents[E]>];
}[keyof ServerToClientEvents];

export interface RoomTransport {
  emit(socketId: string, ...msg: ServerMessage): void;
}

/** Error surfaced to clients as `{ ok: false, error: code }`. */
export class RoomError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

interface SeatSlot {
  player: PlayerProfile | null;
  isBot: boolean;
  /** socket of the human in this seat; null when disconnected (or bot / empty) */
  socketId: string | null;
  /** identity was verified via auth token */
  verified: boolean;
}

interface Spectator {
  profile: PlayerProfile;
  socketId: string;
  verified: boolean;
}

export interface RoomDeps {
  transport: RoomTransport;
  timing: GameTiming;
  rng?: () => number;
  now?: () => number;
  /** called once when the room destroys itself (empty timeout / last human left) */
  onDestroy?: (room: Room) => void;
}

export interface JoinResult {
  /** previous socket for the same profile that this join replaced (caller should detach it) */
  replacedSocketId: string | null;
  seat: Seat | null;
}

const SEATS: Seat[] = [0, 1, 2, 3];
const BOT_NAMES = ['Bot Ivan', 'Bot Maria', 'Bot Georgi', 'Bot Elena'];

export class Room {
  readonly code: string;
  hostId: string;
  settings: RoomSettings;
  status: RoomView['status'] = 'lobby';
  match: MatchState | null = null;
  turnDeadline: number | null = null;
  destroyed = false;
  /** host pause: no timers run while true */
  paused = false;
  /** while paused: frozen turn time left (or ready-up time left during roundEnd) */
  pausedRemainingMs: number | null = null;
  /** human seats currently auto-played after a turn timeout / ready-up timeout */
  readonly afkSeats = new Set<Seat>();
  /** round-end ready-up (phase 'roundEnd' only) */
  roundReady: { readySeats: Set<Seat>; deadline: number } | null = null;

  private seats: SeatSlot[] = SEATS.map(() => ({ player: null, isBot: false, socketId: null, verified: false }));
  private spectators = new Map<string, Spectator>();
  /** the single game-loop timer: bot move, turn timeout, ready-up deadline or next-deal beat */
  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  /** what `turnTimer` will do for the seat on turn (null when it's not an auto move / nothing armed) */
  private pendingAuto: { seat: Seat; kind: 'bot' | 'timeout' } | null = null;
  private emptyTimer: ReturnType<typeof setTimeout> | null = null;
  /** bumps whenever the scheduled turn changes; stale timer callbacks compare against it */
  private generation = 0;
  private readonly deps: RoomDeps;
  private readonly now: () => number;

  constructor(code: string, host: PlayerProfile, settings: RoomSettings, deps: RoomDeps) {
    this.code = code;
    this.hostId = host.id;
    this.settings = { ...settings };
    this.deps = deps;
    this.now = deps.now ?? Date.now;
  }

  // ───────────────────────────── queries ─────────────────────────────

  toView(): RoomView {
    const seats = SEATS.map(
      (seat): SeatInfo => ({
        seat,
        player: this.seats[seat].player ? { ...this.seats[seat].player! } : null,
        isBot: this.seats[seat].isBot,
        connected: this.seats[seat].isBot || this.seats[seat].socketId !== null,
      }),
    ) as RoomView['seats'];
    return {
      code: this.code,
      hostId: this.hostId,
      settings: { ...this.settings },
      seats,
      status: this.status,
      turnDeadline: this.turnDeadline,
      paused: this.paused,
      pausedRemainingMs: this.paused ? this.pausedRemainingMs : null,
      afkSeats: [...this.afkSeats].sort(),
      roundReady: this.roundReady
        ? { readySeats: [...this.roundReady.readySeats].sort(), deadline: this.roundReady.deadline }
        : null,
    };
  }

  seatOfSocket(socketId: string): Seat | null {
    const i = this.seats.findIndex((s) => s.socketId === socketId);
    return i < 0 ? null : (i as Seat);
  }

  private seatOfProfile(profileId: string): Seat | null {
    const i = this.seats.findIndex((s) => !s.isBot && s.player?.id === profileId);
    return i < 0 ? null : (i as Seat);
  }

  private spectatorBySocket(socketId: string): Spectator | null {
    for (const s of this.spectators.values()) if (s.socketId === socketId) return s;
    return null;
  }

  /** Profile of whoever owns this socket (seated or spectating). */
  memberProfile(socketId: string): PlayerProfile | null {
    const seat = this.seatOfSocket(socketId);
    if (seat !== null) return this.seats[seat].player;
    return this.spectatorBySocket(socketId)?.profile ?? null;
  }

  hasSocket(socketId: string): boolean {
    return this.memberProfile(socketId) !== null;
  }

  private connectedSockets(): string[] {
    const out: string[] = [];
    for (const s of this.seats) if (s.socketId) out.push(s.socketId);
    for (const s of this.spectators.values()) out.push(s.socketId);
    return out;
  }

  connectedHumanCount(): number {
    return this.connectedSockets().length;
  }

  /** humans that still "belong" to the room: seated (connected or not) + spectators */
  private humanCount(): number {
    return this.seats.filter((s) => !s.isBot && s.player).length + this.spectators.size;
  }

  private isSeatFree(seat: Seat): boolean {
    return !this.seats[seat].player && !this.seats[seat].isBot;
  }

  private inLobbyLike(): boolean {
    return this.status !== 'playing';
  }

  // ───────────────────────────── membership ─────────────────────────────

  /**
   * Join (or re-join) the room. A profile id already seated reclaims its seat (reconnection);
   * new players take the first free seat while not playing, otherwise they spectate.
   */
  join(socketId: string, profile: PlayerProfile, verified: boolean): JoinResult {
    this.assertAlive();
    let replacedSocketId: string | null = null;
    let seat = this.seatOfProfile(profile.id);

    if (seat !== null) {
      const slot = this.seats[seat];
      if (slot.verified && !verified) throw new RoomError('IDENTITY_MISMATCH');
      replacedSocketId = slot.socketId !== socketId ? slot.socketId : null;
      slot.socketId = socketId;
      slot.player = { ...profile };
      slot.verified = verified;
    } else {
      const existing = this.spectators.get(profile.id);
      if (existing) {
        if (existing.verified && !verified) throw new RoomError('IDENTITY_MISMATCH');
        replacedSocketId = existing.socketId !== socketId ? existing.socketId : null;
        this.spectators.delete(profile.id);
      }
      const free = this.inLobbyLike() && !existing ? SEATS.find((s) => this.isSeatFree(s)) : undefined;
      if (free !== undefined) {
        this.seats[free] = { player: { ...profile }, isBot: false, socketId, verified };
        seat = free;
      } else {
        this.spectators.set(profile.id, { profile: { ...profile }, socketId, verified });
      }
    }

    this.cancelEmptyTimer();
    // a reconnecting/new human may take host back if the current host is gone
    this.ensureHost();
    this.broadcast();
    return { replacedSocketId, seat };
  }

  /** Explicit leave. Mid-game, the seat is taken over by a bot. */
  leave(socketId: string): void {
    if (this.destroyed) return;
    const seat = this.seatOfSocket(socketId);
    let leftId: string | null = null;
    if (seat !== null) {
      leftId = this.seats[seat].player?.id ?? null;
      if (this.status === 'playing') this.seats[seat] = this.botSlot(seat);
      else this.seats[seat] = { player: null, isBot: false, socketId: null, verified: false };
      this.afkSeats.delete(seat);
    } else {
      const spec = this.spectatorBySocket(socketId);
      if (!spec) return;
      leftId = spec.profile.id;
      this.spectators.delete(spec.profile.id);
    }
    if (leftId === this.hostId) this.transferHost(leftId);
    if (this.humanCount() === 0) {
      this.destroy('empty');
      return;
    }
    this.checkEmpty();
    if (this.status === 'playing' && seat !== null) {
      // the bot replacing the player counts as ready; if it's on turn, let it act
      if (this.roundReady) this.armRoundReady();
      else if (this.match?.turn === seat) this.schedule(false);
    }
    this.broadcast();
  }

  /** Socket dropped. Seated players keep their seat (connected:false); spectators are removed. */
  disconnect(socketId: string): void {
    if (this.destroyed) return;
    const seat = this.seatOfSocket(socketId);
    if (seat !== null) {
      this.seats[seat].socketId = null;
    } else {
      const spec = this.spectatorBySocket(socketId);
      if (!spec) return;
      this.spectators.delete(spec.profile.id);
    }
    this.ensureHost();
    this.checkEmpty();
    // a disconnected seat counts as ready during round-end ready-up
    if (seat !== null && this.roundReady) this.armRoundReady();
    this.broadcast();
  }

  private botSlot(seat: Seat): SeatSlot {
    return {
      player: { id: `bot:${this.code}:${seat}`, name: BOT_NAMES[seat], isGuest: true },
      isBot: true,
      socketId: null,
      verified: false,
    };
  }

  private isConnectedHuman(id: string): boolean {
    const seat = this.seatOfProfile(id);
    if (seat !== null) return this.seats[seat].socketId !== null;
    return this.spectators.has(id);
  }

  private transferHost(excludeId: string | null): void {
    const candidates: string[] = [];
    for (const s of this.seats) if (!s.isBot && s.player && s.socketId && s.player.id !== excludeId) candidates.push(s.player.id);
    for (const s of this.spectators.values()) if (s.profile.id !== excludeId) candidates.push(s.profile.id);
    for (const s of this.seats) if (!s.isBot && s.player && !s.socketId && s.player.id !== excludeId) candidates.push(s.player.id);
    if (candidates.length) this.hostId = candidates[0];
  }

  /** Keep the host a connected human when possible. */
  private ensureHost(): void {
    if (this.isConnectedHuman(this.hostId)) return;
    const stillMember = this.seatOfProfile(this.hostId) !== null || this.spectators.has(this.hostId);
    const anyConnected = this.connectedHumanCount() > 0;
    if (!stillMember || anyConnected) this.transferHost(this.hostId);
  }

  private requireHost(socketId: string): void {
    const p = this.memberProfile(socketId);
    if (!p) throw new RoomError('NOT_IN_ROOM');
    if (p.id !== this.hostId) throw new RoomError('NOT_HOST');
  }

  private requireLobby(): void {
    if (!this.inLobbyLike()) throw new RoomError('GAME_IN_PROGRESS');
  }

  // ───────────────────────────── lobby ops ─────────────────────────────

  sit(socketId: string, seat: Seat): void {
    this.assertAlive();
    this.requireLobby();
    const profile = this.memberProfile(socketId);
    if (!profile) throw new RoomError('NOT_IN_ROOM');
    const current = this.seatOfSocket(socketId);
    if (current === seat) return;
    if (!this.isSeatFree(seat)) throw new RoomError('SEAT_TAKEN');
    if (current !== null) {
      this.seats[seat] = this.seats[current];
      this.seats[current] = { player: null, isBot: false, socketId: null, verified: false };
    } else {
      const spec = this.spectatorBySocket(socketId)!;
      this.spectators.delete(spec.profile.id);
      this.seats[seat] = { player: spec.profile, isBot: false, socketId, verified: spec.verified };
    }
    this.broadcast();
  }

  addBot(socketId: string, seat: Seat): void {
    this.assertAlive();
    this.requireHost(socketId);
    this.requireLobby();
    if (!this.isSeatFree(seat)) throw new RoomError('SEAT_TAKEN');
    this.seats[seat] = this.botSlot(seat);
    this.broadcast();
  }

  removeBot(socketId: string, seat: Seat): void {
    this.assertAlive();
    this.requireHost(socketId);
    this.requireLobby();
    if (!this.seats[seat].isBot) throw new RoomError('NOT_A_BOT');
    this.seats[seat] = { player: null, isBot: false, socketId: null, verified: false };
    this.broadcast();
  }

  updateSettings(socketId: string, settings: RoomSettings): void {
    this.assertAlive();
    this.requireHost(socketId);
    this.requireLobby();
    this.settings = { ...settings };
    this.broadcast();
  }

  start(socketId: string): void {
    this.assertAlive();
    this.requireHost(socketId);
    this.requireLobby();
    if (!SEATS.every((s) => !this.isSeatFree(s))) throw new RoomError('SEATS_NOT_FILLED');
    const rng = this.deps.rng ?? Math.random;
    const dealer = Math.floor(rng() * 4) as Seat;
    try {
      this.match = createMatch({ ...this.settings }, dealer, rng);
    } catch (err) {
      console.error(`[room ${this.code}] createMatch failed`, err);
      throw new RoomError('ENGINE_ERROR');
    }
    this.status = 'playing';
    this.resetMatchFlags();
    this.schedule(false);
    this.broadcast();
  }

  // ───────────────────────────── gameplay ─────────────────────────────

  action(socketId: string, action: GameAction): void {
    this.assertAlive();
    if (this.status !== 'playing' || !this.match) throw new RoomError('NOT_PLAYING');
    if (this.paused) throw new RoomError('GAME_PAUSED');
    const seat = this.seatOfSocket(socketId);
    if (seat === null) throw new RoomError('NOT_SEATED');
    if (this.match.turn !== seat) throw new RoomError('NOT_YOUR_TURN');
    if (this.afkSeats.has(seat)) throw new RoomError('SEAT_AFK');
    this.apply(seat, action);
  }

  /** Host pause / resume (idempotent). */
  setPaused(socketId: string, paused: boolean): void {
    this.assertAlive();
    this.requireHost(socketId);
    if (this.status !== 'playing' || !this.match) throw new RoomError('NOT_PLAYING');
    if (paused === this.paused) return;
    if (paused) {
      const now = this.now();
      let remaining: number | null = null;
      if (this.roundReady) remaining = Math.max(0, this.roundReady.deadline - now);
      else if (this.turnDeadline !== null) remaining = Math.max(0, this.turnDeadline - now);
      this.stopTimer();
      this.paused = true;
      this.pausedRemainingMs = remaining;
    } else {
      const remaining = this.pausedRemainingMs;
      this.paused = false;
      this.pausedRemainingMs = null;
      if (this.roundReady) {
        this.roundReady.deadline = this.now() + (remaining ?? this.deps.timing.roundReadyTimeoutMs);
        this.armRoundReady();
      } else {
        this.schedule(false, remaining);
      }
    }
    this.broadcast();
  }

  /** AFK player takes control back (from their next turn). */
  imBack(socketId: string): void {
    this.assertAlive();
    const seat = this.seatOfSocket(socketId);
    if (seat === null) throw new RoomError('NOT_SEATED');
    if (this.status !== 'playing' || !this.match) throw new RoomError('NOT_PLAYING');
    if (!this.afkSeats.delete(seat)) return;
    const m = this.match;
    const onTurn = (m.phase === 'bidding' || m.phase === 'playing') && m.turn === seat;
    // an already scheduled bot move for this seat is allowed to happen; otherwise start a fresh human turn
    if (onTurn && !this.paused && this.pendingAuto?.seat !== seat) this.schedule(false);
    this.broadcast();
  }

  /** Round-end "Continue". */
  ready(socketId: string): void {
    this.assertAlive();
    const seat = this.seatOfSocket(socketId);
    if (seat === null) throw new RoomError('NOT_SEATED');
    if (this.status !== 'playing' || !this.match || this.match.phase !== 'roundEnd' || !this.roundReady) {
      throw new RoomError('NOT_ROUND_END');
    }
    if (this.paused) throw new RoomError('GAME_PAUSED');
    if (this.roundReady.readySeats.has(seat)) return;
    this.roundReady.readySeats.add(seat);
    this.armRoundReady();
    this.broadcast();
  }

  chat(socketId: string, text: string): void {
    this.assertAlive();
    const profile = this.memberProfile(socketId);
    if (!profile) throw new RoomError('NOT_IN_ROOM');
    const msg = { from: profile.name, text, at: this.now() };
    for (const id of this.connectedSockets()) this.deps.transport.emit(id, 'chat:message', msg);
  }

  private apply(seat: Seat, action: GameAction): void {
    if (!this.match) return;
    let result: { state: MatchState; events: GameEvent[] };
    try {
      result = applyAction(this.match, seat, action);
    } catch (err) {
      if (err instanceof EngineError) throw new RoomError(err.code, err.message);
      console.error(`[room ${this.code}] applyAction failed`, err);
      throw new RoomError('ENGINE_ERROR');
    }
    this.match = result.state;
    if (this.match.phase === 'matchEnd') {
      this.status = 'finished';
      this.resetMatchFlags();
    }
    const trickDone = result.events.some((e) => e.type === 'trickWon');
    this.schedule(trickDone);
    this.broadcast(result.events);
  }

  /** pause / AFK / ready-up state does not survive a match boundary */
  private resetMatchFlags(): void {
    this.paused = false;
    this.pausedRemainingMs = null;
    this.afkSeats.clear();
    this.roundReady = null;
  }

  /** seat is played by the server: a bot, or a human marked AFK */
  private isAutoSeat(seat: Seat): boolean {
    return this.seats[seat].isBot || this.afkSeats.has(seat);
  }

  /**
   * Arms the timer for whatever should happen next (bot move, turn timeout, round-end ready-up).
   * `humanRemainingMs` (resume after pause) replaces the full turn time for a human on turn.
   */
  private schedule(trickJustCompleted: boolean, humanRemainingMs: number | null = null): void {
    this.stopTimer();
    const m = this.match;
    if (this.status !== 'playing' || !m || this.destroyed) return;
    const t = this.deps.timing;

    if (m.phase === 'roundEnd') {
      if (!this.roundReady) {
        this.roundReady = { readySeats: new Set(), deadline: this.now() + t.roundReadyTimeoutMs };
        if (this.paused) this.pausedRemainingMs = t.roundReadyTimeoutMs;
      }
      this.armRoundReady();
      return;
    }
    if (m.phase !== 'bidding' && m.phase !== 'playing') return;
    const seat = m.turn;
    if (seat === null) return;

    const auto = this.isAutoSeat(seat);
    if (this.paused) {
      // nothing runs while paused; resume() re-schedules. A bot on turn has no frozen timer.
      if (auto) this.pausedRemainingMs = null;
      return;
    }
    const pause = trickJustCompleted ? t.trickPauseMs : 0;
    let delay: number;
    if (auto) {
      delay = Math.max(t.botDelayMs, pause);
    } else {
      delay = humanRemainingMs ?? pause + this.settings.turnTimerSeconds * t.msPerTimerSecond;
      this.turnDeadline = this.now() + delay;
    }
    const kind = auto ? 'bot' : 'timeout';
    this.pendingAuto = { seat, kind };
    const gen = this.generation;
    this.turnTimer = setTimeout(() => {
      if (gen !== this.generation) return;
      this.turnTimer = null;
      this.pendingAuto = null;
      if (kind === 'timeout') {
        // human timed out → AFK, the bot plays for them until 'game:imBack'
        if (this.seats[seat].isBot || !this.seats[seat].player) return;
        this.afkSeats.add(seat);
      }
      this.autoPlay(seat);
    }, delay);
  }

  /**
   * Round-end ready-up: marks bots / AFK / disconnected seats ready, then arms either the short
   * next-deal beat (everyone ready) or the ready-up deadline. No-op while paused.
   */
  private armRoundReady(): void {
    const rr = this.roundReady;
    if (!rr || this.destroyed) return;
    for (const s of SEATS) {
      const slot = this.seats[s];
      if (slot.isBot || this.afkSeats.has(s) || !slot.player || slot.socketId === null) rr.readySeats.add(s);
    }
    this.stopTimer();
    if (this.paused) return;
    const gen = this.generation;
    const allReady = rr.readySeats.size === SEATS.length;
    const delay = allReady ? this.deps.timing.roundEndDelayMs : Math.max(0, rr.deadline - this.now());
    this.turnTimer = setTimeout(() => {
      if (gen !== this.generation || this.roundReady !== rr) return;
      this.turnTimer = null;
      if (!allReady) {
        for (const s of SEATS) {
          if (!rr.readySeats.has(s) && !this.seats[s].isBot && this.seats[s].player) this.afkSeats.add(s);
        }
      }
      this.dealNextRound();
    }, delay);
  }

  private dealNextRound(): void {
    if (!this.match || this.match.phase !== 'roundEnd' || this.destroyed) return;
    this.roundReady = null;
    try {
      this.match = startNextRound(this.match, this.deps.rng);
    } catch (err) {
      console.error(`[room ${this.code}] startNextRound failed`, err);
      return;
    }
    this.schedule(false);
    this.broadcast();
  }

  /** Plays chooseAutoAction for a seat (bot move or timeout), with a legal-move fallback. */
  private autoPlay(seat: Seat): void {
    const m = this.match;
    if (!m || this.destroyed || m.turn !== seat) return;
    const candidates: (() => GameAction)[] = [
      () => chooseAutoAction(m, seat),
      () => {
        const v = getPlayerView(m, seat);
        if (m.phase === 'bidding') return { type: 'bid', bid: v.legalBids[0] ?? { kind: 'pass' } };
        return { type: 'play', card: v.legalCards[0] };
      },
    ];
    for (const make of candidates) {
      try {
        this.apply(seat, make());
        return;
      } catch (err) {
        console.error(`[room ${this.code}] auto action failed for seat ${seat}`, err);
      }
    }
    this.broadcast(); // at least publish the AFK flag
  }

  // ───────────────────────────── broadcast ─────────────────────────────

  broadcast(events?: GameEvent[]): void {
    if (this.destroyed) return;
    const view = this.toView();
    for (const s of SEATS) {
      const id = this.seats[s].socketId;
      if (id) this.sendTo(id, view, events, s);
    }
    for (const spec of this.spectators.values()) this.sendTo(spec.socketId, view, events, null);
  }

  /** Full state for one socket (used after (re)join). */
  sendState(socketId: string): void {
    if (this.destroyed) return;
    const seat = this.seatOfSocket(socketId);
    this.sendTo(socketId, this.toView(), undefined, seat);
  }

  private sendTo(socketId: string, view: RoomView, events: GameEvent[] | undefined, seat: Seat | null): void {
    const { transport } = this.deps;
    transport.emit(socketId, 'room:state', view);
    if (!this.match) return;
    if (events && events.length) transport.emit(socketId, 'game:events', events);
    try {
      transport.emit(socketId, 'game:state', getPlayerView(this.match, seat));
    } catch (err) {
      console.error(`[room ${this.code}] getPlayerView failed`, err);
    }
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  private checkEmpty(): void {
    if (this.connectedHumanCount() > 0) {
      this.cancelEmptyTimer();
      return;
    }
    if (this.emptyTimer) return;
    this.emptyTimer = setTimeout(() => {
      this.emptyTimer = null;
      if (this.connectedHumanCount() === 0) this.destroy('inactive');
    }, this.deps.timing.emptyRoomTtlMs);
  }

  private cancelEmptyTimer(): void {
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    this.emptyTimer = null;
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
  }

  /** cancel whatever the game loop had armed and invalidate stale callbacks */
  private stopTimer(): void {
    this.clearTurnTimer();
    this.turnDeadline = null;
    this.pendingAuto = null;
    this.generation++;
  }

  destroy(reason: string): void {
    if (this.destroyed) return;
    for (const id of this.connectedSockets()) this.deps.transport.emit(id, 'room:closed', reason);
    this.destroyed = true;
    this.clearTurnTimer();
    this.cancelEmptyTimer();
    this.generation++;
    this.deps.onDestroy?.(this);
  }

  private assertAlive(): void {
    if (this.destroyed) throw new RoomError('ROOM_CLOSED');
  }
}
