/** Room-level tests for host pause, AFK takeover and round-end ready-up (fake timers, real engine). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chooseAutoAction, DEFAULT_SETTINGS, type RoomView, type Seat } from '@belot/engine';
import type { GameTiming } from '../config';
import { profile } from '../test/helpers';
import { RoomError, type ServerMessage } from './Room';
import { RoomManager } from './RoomManager';

const TIMING: GameTiming = {
  botDelayMs: 100,
  trickPauseMs: 0,
  roundEndDelayMs: 50,
  roundReadyTimeoutMs: 10_000,
  emptyRoomTtlMs: 10 * 60_000,
  msPerTimerSecond: 1000,
};
const TURN_MS = 15_000;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** humans h0..h{n-1} on seats 0..n-1 (sockets s0..), bots elsewhere; match started */
function setup(humans: number) {
  const sent: { to: string; msg: ServerMessage }[] = [];
  const mgr = new RoomManager({
    transport: { emit: (to, ...msg) => sent.push({ to, msg }) },
    timing: TIMING,
    rng: mulberry32(42),
    now: () => Date.now(),
  });
  const room = mgr.create('s0', profile('h0'), false, { ...DEFAULT_SETTINGS, turnTimerSeconds: 15 });
  for (let i = 1; i < humans; i++) mgr.join(`s${i}`, room.code, profile(`h${i}`), false);
  for (let s = humans; s < 4; s++) mgr.addBot('s0', s as Seat);
  mgr.start('s0');
  const lastRoom = (sid = 's0'): RoomView => {
    for (let i = sent.length - 1; i >= 0; i--) if (sent[i].to === sid && sent[i].msg[0] === 'room:state') return sent[i].msg[1] as RoomView;
    throw new Error('no room:state');
  };
  /** advance fake time in small steps until pred holds */
  const until = (pred: () => boolean, maxMs = 120_000, step = 50) => {
    for (let t = 0; t <= maxMs; t += step) {
      if (pred()) return;
      vi.advanceTimersByTime(step);
    }
    throw new Error('condition never reached');
  };
  const inTurn = () => room.match!.phase === 'bidding' || room.match!.phase === 'playing';
  /** play human turns immediately (legal auto move) and let bots act, until pred holds */
  const playUntil = (pred: () => boolean, maxSteps = 5000) => {
    for (let i = 0; i < maxSteps; i++) {
      if (pred()) return;
      const m = room.match!;
      const seat = m.turn;
      if (inTurn() && seat !== null && seat < humans && !room.afkSeats.has(seat)) mgr.action(`s${seat}`, chooseAutoAction(m, seat));
      else vi.advanceTimersByTime(25);
    }
    throw new Error('playUntil: condition never reached');
  };
  return { mgr, room, sent, lastRoom, until, playUntil, inTurn };
}

const err = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof RoomError) return e.code;
    throw e;
  }
  return 'NO_ERROR';
};

describe('host pause', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('only host, only while playing', () => {
    const sent: ServerMessage[] = [];
    const mgr = new RoomManager({ transport: { emit: (_to, ...msg) => sent.push(msg) }, timing: TIMING });
    const room = mgr.create('s0', profile('h0'), false, DEFAULT_SETTINGS);
    mgr.join('s1', room.code, profile('h1'), false);
    expect(err(() => mgr.setPaused('s0', true))).toBe('NOT_PLAYING');
    expect(err(() => mgr.setPaused('s1', true))).toBe('NOT_HOST');
    expect(err(() => mgr.setPaused('nobody', true))).toBe('NOT_IN_ROOM');
  });

  it('freezes and restores the human turn timer; actions rejected while paused; chat still works', () => {
    const { mgr, room, lastRoom, until, inTurn, sent } = setup(2);
    until(() => inTurn() && room.match!.turn === 0 && room.turnDeadline !== null);
    vi.advanceTimersByTime(5000);
    const expectedRemaining = room.turnDeadline! - Date.now();
    expect(err(() => mgr.setPaused('s1', true))).toBe('NOT_HOST');
    mgr.setPaused('s0', true);
    expect(lastRoom('s1')).toMatchObject({ paused: true, pausedRemainingMs: expectedRemaining, turnDeadline: null });
    const before = room.match;
    vi.advanceTimersByTime(10 * 60_000 - 1000);
    expect(room.match).toBe(before); // nothing moved
    expect(room.afkSeats.size).toBe(0);
    expect(err(() => mgr.action('s0', chooseAutoAction(room.match!, 0)))).toBe('GAME_PAUSED');
    mgr.chat('s1', 'hi');
    expect(sent.some((s) => s.to === 's0' && s.msg[0] === 'chat:message')).toBe(true);
    mgr.setPaused('s0', true); // idempotent

    mgr.setPaused('s0', false);
    expect(lastRoom('s1')).toMatchObject({ paused: false, pausedRemainingMs: null, turnDeadline: Date.now() + expectedRemaining });
    vi.advanceTimersByTime(expectedRemaining - 1);
    expect(room.afkSeats.has(0)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(room.afkSeats.has(0)).toBe(true); // timed out → AFK
  });

  it('bots do not move while paused and resume afterwards', () => {
    const { mgr, room, until, inTurn } = setup(1);
    until(() => inTurn() && room.match!.turn !== 0, 120_000, 10);
    mgr.setPaused('s0', true);
    expect(room.toView().pausedRemainingMs).toBeNull(); // bot on turn → no frozen human timer
    const before = room.match;
    vi.advanceTimersByTime(60_000);
    expect(room.match).toBe(before);
    mgr.setPaused('s0', false);
    vi.advanceTimersByTime(TIMING.botDelayMs);
    expect(room.match).not.toBe(before);
  });

  it('host leaving while paused keeps the game paused; new host can resume', () => {
    const { mgr, room, until, inTurn, lastRoom } = setup(2);
    until(() => inTurn() && room.match!.turn === 0 && room.turnDeadline !== null);
    mgr.setPaused('s0', true);
    mgr.leave('s0'); // seat 0 → bot, which is on turn
    expect(lastRoom('s1')).toMatchObject({ paused: true, hostId: 'h1', pausedRemainingMs: null });
    const before = room.match;
    vi.advanceTimersByTime(60_000);
    expect(room.match).toBe(before);
    mgr.setPaused('s1', false);
    vi.advanceTimersByTime(TIMING.botDelayMs);
    expect(room.match).not.toBe(before);
  });
});

describe('AFK takeover', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('timeout → AFK + auto move; later turns auto-played at bot speed; imBack restores control on next turn', () => {
    const { mgr, room, lastRoom, until, inTurn } = setup(1);
    until(() => inTurn() && room.match!.turn === 0 && room.turnDeadline !== null);
    vi.advanceTimersByTime(TURN_MS);
    expect(lastRoom('s0').afkSeats).toEqual([0]);
    expect(room.match!.turn).not.toBe(0);
    expect(err(() => mgr.ready('s0'))).toBe('NOT_ROUND_END');

    // next turn of seat 0: no timer, played after the bot delay
    until(() => inTurn() && room.match!.turn === 0, 120_000, 10);
    expect(room.turnDeadline).toBeNull();
    // imBack while a bot move for the seat is already scheduled → that move still happens
    mgr.imBack('s0');
    expect(lastRoom('s0').afkSeats).toEqual([]);
    const before = room.match;
    vi.advanceTimersByTime(TIMING.botDelayMs);
    expect(room.match).not.toBe(before);
    // from the next turn on, the human has control again (timer runs)
    until(() => inTurn() && room.match!.turn === 0, 120_000, 10);
    expect(room.turnDeadline).not.toBeNull();
    expect(room.afkSeats.size).toBe(0);
  });

  it('AFK seat cannot act; imBack on own turn with nothing scheduled starts a fresh timer', () => {
    const { mgr, room, until, inTurn } = setup(1);
    until(() => inTurn() && room.match!.turn === 0 && room.turnDeadline !== null);
    vi.advanceTimersByTime(TURN_MS);
    expect(room.afkSeats.has(0)).toBe(true);
    until(() => inTurn() && room.match!.turn === 0, 120_000, 10);
    expect(err(() => mgr.action('s0', chooseAutoAction(room.match!, 0)))).toBe('SEAT_AFK');
    mgr.setPaused('s0', true); // cancels the pending bot move
    mgr.imBack('s0'); // allowed while paused
    mgr.setPaused('s0', false);
    expect(room.turnDeadline).toBe(Date.now() + TURN_MS);
    mgr.action('s0', chooseAutoAction(room.match!, 0));
  });

  it('reconnecting player stays AFK; disconnect is not special-cased', () => {
    const { mgr, room, until, inTurn } = setup(2);
    until(() => inTurn() && room.match!.turn === 1 && room.turnDeadline !== null);
    mgr.disconnect('s1');
    expect(room.turnDeadline).not.toBeNull(); // still the normal timer
    vi.advanceTimersByTime(TURN_MS);
    expect(room.afkSeats.has(1)).toBe(true);
    mgr.join('s1b', room.code, profile('h1'), false);
    expect(room.afkSeats.has(1)).toBe(true);
    mgr.imBack('s1b');
    expect(room.afkSeats.has(1)).toBe(false);
  });

  it('leaving clears AFK for the seat (bot replaces it); new match clears AFK', () => {
    const { mgr, room, until, inTurn } = setup(2);
    until(() => inTurn() && room.match!.turn === 1 && room.turnDeadline !== null);
    vi.advanceTimersByTime(TURN_MS);
    expect(room.afkSeats.has(1)).toBe(true);
    mgr.leave('s1');
    expect(room.afkSeats.has(1)).toBe(false);
    expect(room.toView().seats[1].isBot).toBe(true);
  });
});

describe('round-end ready-up', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('waits for all humans; bots are ready automatically; deals right after the last ready', () => {
    const { mgr, room, lastRoom, playUntil } = setup(2);
    expect(err(() => mgr.ready('s0'))).toBe('NOT_ROUND_END');
    playUntil(() => room.match!.phase === 'roundEnd');
    const rr = lastRoom('s0').roundReady!;
    expect(rr.readySeats).toEqual([2, 3]);
    expect(rr.deadline).toBe(Date.now() + TIMING.roundReadyTimeoutMs);
    expect(lastRoom('s0').turnDeadline).toBeNull();
    vi.advanceTimersByTime(TIMING.roundReadyTimeoutMs - 100);
    expect(room.match!.phase).toBe('roundEnd'); // no auto next round
    mgr.ready('s0');
    mgr.ready('s0'); // idempotent
    expect(lastRoom('s1').roundReady!.readySeats).toEqual([0, 2, 3]);
    expect(err(() => mgr.action('s1', { type: 'bid', bid: { kind: 'pass' } }))).not.toBe('NO_ERROR');
    mgr.ready('s1');
    expect(lastRoom('s1').roundReady!.readySeats).toEqual([0, 1, 2, 3]);
    expect(room.match!.phase).toBe('roundEnd');
    vi.advanceTimersByTime(TIMING.roundEndDelayMs);
    expect(room.match!.phase).toBe('bidding');
    expect(room.match!.roundNumber).toBe(2);
    expect(lastRoom('s1').roundReady).toBeNull();
    expect(room.afkSeats.size).toBe(0);
  });

  it('deadline marks not-ready humans AFK and deals', () => {
    const { mgr, room, lastRoom, playUntil } = setup(2);
    playUntil(() => room.match!.phase === 'roundEnd');
    mgr.ready('s0');
    vi.advanceTimersByTime(TIMING.roundReadyTimeoutMs);
    expect(room.match!.phase).toBe('bidding');
    expect(lastRoom('s0').afkSeats).toEqual([1]);
    expect(lastRoom('s0').roundReady).toBeNull();
  });

  it('a disconnect during ready-up counts as ready', () => {
    const { mgr, room, lastRoom, playUntil } = setup(2);
    playUntil(() => room.match!.phase === 'roundEnd');
    mgr.ready('s0');
    mgr.disconnect('s1');
    expect(lastRoom('s0').roundReady!.readySeats).toEqual([0, 1, 2, 3]);
    vi.advanceTimersByTime(TIMING.roundEndDelayMs);
    expect(room.match!.phase).toBe('bidding');
    expect(room.afkSeats.size).toBe(0); // disconnected ≠ AFK (they'll time out → AFK)
  });

  it('pause freezes the ready-up deadline; ready rejected while paused', () => {
    const { mgr, room, lastRoom, playUntil } = setup(2);
    playUntil(() => room.match!.phase === 'roundEnd');
    vi.advanceTimersByTime(4000);
    mgr.setPaused('s0', true);
    expect(lastRoom('s0')).toMatchObject({ paused: true, pausedRemainingMs: TIMING.roundReadyTimeoutMs - 4000 });
    expect(err(() => mgr.ready('s1'))).toBe('GAME_PAUSED');
    vi.advanceTimersByTime(60_000);
    expect(room.match!.phase).toBe('roundEnd');
    mgr.setPaused('s0', false);
    expect(lastRoom('s0').roundReady!.deadline).toBe(Date.now() + TIMING.roundReadyTimeoutMs - 4000);
    vi.advanceTimersByTime(TIMING.roundReadyTimeoutMs - 4000);
    expect(room.match!.phase).toBe('bidding');
    expect([...room.afkSeats].sort()).toEqual([0, 1]);
  });

  it('AFK humans are ready automatically; spectators cannot ready', () => {
    const { mgr, room, playUntil, until, inTurn } = setup(1);
    mgr.join('spec', room.code, profile('spec'), false);
    until(() => inTurn() && room.match!.turn === 0 && room.turnDeadline !== null);
    vi.advanceTimersByTime(TURN_MS); // seat 0 AFK → table fully automatic
    until(() => room.match!.phase === 'roundEnd', 120_000, 10);
    expect(room.roundReady!.readySeats.size).toBe(4);
    expect(err(() => mgr.ready('spec'))).toBe('NOT_SEATED');
    until(() => room.match!.roundNumber === 2, TIMING.roundEndDelayMs + 50, 10);
  });
});
