/**
 * Claim All (Прибиране) at room level: a human claim ends the round in one action, the 'claimed'
 * event + revealed hand reach every member, and the normal ready-up → next deal path follows.
 * Claim All is human-only: bots / AFK auto-moves never claim (chooseAutoAction never returns a claim).
 * Fake timers, real engine (chooseAutoAction is only spied on).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as engine from '@belot/engine';
import type { GameEvent, GameAction, MatchState, PlayerView, RoomView, Seat } from '@belot/engine';
import type { GameTiming } from '../config';
import { profile } from '../test/helpers';
import type { ServerMessage } from './Room';
import { RoomManager } from './RoomManager';

/** records every action the auto-player produced */
const ctl = vi.hoisted(() => ({ autoActions: [] as { type: string }[] }));

vi.mock('@belot/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('@belot/engine')>();
  return {
    ...real,
    chooseAutoAction: (m: MatchState, seat: Seat): GameAction => {
      const a = real.chooseAutoAction(m, seat);
      ctl.autoActions.push(a);
      return a;
    },
  };
});

const TIMING: GameTiming = {
  botDelayMs: 100,
  trickPauseMs: 0,
  roundEndDelayMs: 50,
  roundReadyTimeoutMs: 10_000,
  emptyRoomTtlMs: 10 * 60_000,
  msPerTimerSecond: 1000,
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setup(humans: number, seed = 7) {
  const sent: { to: string; msg: ServerMessage }[] = [];
  const mgr = new RoomManager({
    transport: { emit: (to, ...msg) => sent.push({ to, msg }) },
    timing: TIMING,
    rng: mulberry32(seed),
    now: () => Date.now(),
  });
  const room = mgr.create('s0', profile('h0'), false, { ...engine.DEFAULT_SETTINGS, turnTimerSeconds: 15 });
  for (let i = 1; i < humans; i++) mgr.join(`s${i}`, room.code, profile(`h${i}`), false);
  for (let s = humans; s < 4; s++) mgr.addBot('s0', s as Seat);
  mgr.start('s0');
  const last = <T>(sid: string, kind: 'room:state' | 'game:state'): T => {
    for (let i = sent.length - 1; i >= 0; i--) if (sent[i].to === sid && sent[i].msg[0] === kind) return sent[i].msg[1] as T;
    throw new Error(`no ${kind}`);
  };
  const events = (sid: string): GameEvent[] =>
    sent.filter((s) => s.to === sid && s.msg[0] === 'game:events').flatMap((s) => s.msg[1] as GameEvent[]);
  const inTurn = () => room.match!.phase === 'bidding' || room.match!.phase === 'playing';
  /** human turns played immediately with the real auto move, bots act on their timers */
  const playUntil = (pred: () => boolean, maxSteps = 20_000) => {
    for (let i = 0; i < maxSteps; i++) {
      if (pred()) return;
      const m = room.match!;
      const seat = m.turn;
      if (inTurn() && seat !== null && seat < humans && !room.afkSeats.has(seat)) {
        const a = engine.chooseAutoAction(m, seat);
        mgr.action(`s${seat}`, a.type === 'claim' ? { type: 'play', card: engine.getPlayerView(m, seat).legalCards[0] } : a);
      } else {
        // an earlier round ended (e.g. a bot claimed or all passed): humans continue so they don't go AFK
        if (m.phase === 'roundEnd' && room.roundReady) for (let h = 0; h < humans; h++) if (!room.roundReady.readySeats.has(h as Seat)) mgr.ready(`s${h}`);
        vi.advanceTimersByTime(25);
      }
    }
    throw new Error('playUntil: condition never reached');
  };
  return { mgr, room, sent, last, events, playUntil, inTurn };
}

describe('Claim All in a room', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ctl.autoActions.length = 0;
  });
  afterEach(() => vi.useRealTimers());

  it('human claim ends the round, broadcasts claimed + revealed hand, then ready-up deals the next round', () => {
    const { mgr, room, last, events, playUntil } = setup(2);
    // seat 0 on turn during play, after at least one completed trick
    playUntil(() => room.match!.phase === 'playing' && room.match!.turn === 0 && room.match!.tricks.length >= 1);
    expect(last<PlayerView>('s0', 'game:state').canClaim).toBe(true);
    expect(last<PlayerView>('s1', 'game:state').canClaim).toBeFalsy(); // not on turn
    const hand = [...room.match!.hands[0]];
    const roundNo = room.match!.roundNumber;

    mgr.action('s0', { type: 'claim' });

    const m = room.match!;
    expect(['roundEnd', 'matchEnd']).toContain(m.phase);
    for (const sid of ['s0', 's1']) {
      const claimed = events(sid).find((e) => e.type === 'claimed');
      expect(claimed, `claimed event for ${sid}`).toBeDefined();
      if (claimed?.type !== 'claimed') continue;
      expect(claimed.claim.seat).toBe(0);
      expect(claimed.claim.revealed).toEqual(expect.arrayContaining(hand));
      expect(claimed.claim.revealed).toHaveLength(hand.length);
      expect(events(sid).some((e) => e.type === 'roundEnded')).toBe(true);
      // everyone (incl. the other human) sees the claimer's revealed hand
      const v = last<PlayerView>(sid, 'game:state');
      expect(v.claim?.seat).toBe(0);
      expect(v.claim?.revealed).toHaveLength(hand.length);
      expect(v.canClaim).toBeFalsy();
    }
    const result = m.roundHistory[m.roundHistory.length - 1];
    expect(result.claim?.seat).toBe(0);
    if (m.phase === 'matchEnd') {
      expect(room.status).toBe('finished');
      return;
    }
    // normal ready-up path
    const rr = last<RoomView>('s0', 'room:state').roundReady!;
    expect(rr.readySeats).toEqual([2, 3]);
    mgr.ready('s0');
    mgr.ready('s1');
    vi.advanceTimersByTime(TIMING.roundEndDelayMs);
    expect(room.match!.phase).toBe('bidding');
    expect(room.match!.roundNumber).toBe(roundNo + 1);
    expect(last<PlayerView>('s1', 'game:state').claim ?? null).toBeNull(); // cleared for the new round
  });

  it('claim is rejected out of turn and outside play', () => {
    const { mgr, room, playUntil } = setup(2);
    playUntil(() => room.match!.phase === 'bidding' && room.match!.turn === 0);
    expect(() => mgr.action('s0', { type: 'claim' })).toThrow();
    playUntil(() => room.match!.phase === 'playing' && room.match!.turn === 1);
    expect(() => mgr.action('s0', { type: 'claim' })).toThrow(/NOT_YOUR_TURN/);
  });

  it('bots and AFK auto-play never claim: a fully automatic match has no Claim All', () => {
    const { room, events } = setup(1);
    // seat 0 times out → AFK → fully automatic table until the match ends
    for (let t = 0; t < 3_600_000 && room.match!.phase !== 'matchEnd'; t += 25) vi.advanceTimersByTime(25);
    expect(room.match!.phase).toBe('matchEnd');
    expect(room.afkSeats.size).toBe(0); // cleared at match end
    expect(ctl.autoActions.length).toBeGreaterThan(50);
    expect(ctl.autoActions.filter((a) => a.type === 'claim')).toEqual([]);
    expect(room.match!.roundHistory.some((r) => r.claim)).toBe(false);
    expect(events('s0').some((e) => e.type === 'claimed')).toBe(false);
  });
});
