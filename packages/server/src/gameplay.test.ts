/**
 * Gameplay integration tests — require the real engine (@belot/engine) to be implemented.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { GameEvent } from '@belot/engine';
import type { BelotApp } from './app';
import { connect, createRoom, profile, settings, startServer, waitFor, type Client, FAST_TIMING } from './test/helpers';

let server: BelotApp | undefined;
const clients: Client[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect());
  await server?.close();
  server = undefined;
});

async function setupBots(humans: number, timing = FAST_TIMING) {
  const s = await startServer({ timing });
  server = s.server;
  const cs: Client[] = [];
  for (let i = 0; i < humans; i++) {
    const c = await connect(s.url);
    clients.push(c);
    cs.push(c);
  }
  const code = await createRoom(cs[0], profile('h0'), settings({ turnTimerSeconds: 15 }));
  for (let i = 1; i < humans; i++) await cs[i].emitWithAck('room:join', { code, profile: profile(`h${i}`) });
  for (let seat = humans; seat < 4; seat++) await cs[0].emitWithAck('room:addBot', { seat: seat as 0 | 1 | 2 | 3 });
  return { ...s, cs, code };
}

describe('gameplay', () => {
  it('a full match runs to completion with bots + timed-out human', async () => {
    const { cs, code } = await setupBots(1);
    const events: GameEvent[] = [];
    cs[0].on('game:events', (e) => events.push(...e));
    expect(await cs[0].emitWithAck('room:start', {})).toEqual({ ok: true, data: undefined });
    const v = await waitFor(() => cs[0].lastView());
    expect(v.seat).toBe(0);
    expect(v.handCounts.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    const playing = await waitFor(() => cs[0].rooms.find((r) => r.status === 'playing'));
    expect(playing.code).toBe(code);
    const fin = await waitFor(() => cs[0].rooms.find((r) => r.status === 'finished'), 20000, 'match end');
    expect(fin.turnDeadline).toBeNull();
    expect(cs[0].lastView()!.winner).not.toBeNull();
    expect(events.some((e) => e.type === 'matchEnded')).toBe(true);
    expect(events.some((e) => e.type === 'cardPlayed')).toBe(true);
  }, 30000);

  it('human can act on their turn; illegal moves are rejected; views hide other hands', async () => {
    const { cs } = await setupBots(1, { ...FAST_TIMING, msPerTimerSecond: 1000 });
    await cs[0].emitWithAck('room:start', {});
    const myTurn = await waitFor(() => {
      const v = cs[0].lastView();
      return v && v.turn === 0 && (v.legalBids.length > 0 || v.legalCards.length > 0) ? v : undefined;
    }, 5000, 'my turn');
    const room = cs[0].lastRoom()!;
    expect(room.turnDeadline).toBeGreaterThan(Date.now());
    expect(myTurn.hand.length).toBe(myTurn.handCounts[0]);
    // bad action shape → rejected; wrong card → engine error
    const bad = await cs[0].emitWithAck('game:action', { action: { type: 'play', card: { suit: 'S', rank: 'A' } } });
    if (myTurn.phase === 'bidding') expect(bad).toMatchObject({ ok: false });
    const action =
      myTurn.phase === 'bidding'
        ? ({ type: 'bid', bid: myTurn.legalBids[0] } as const)
        : ({ type: 'play', card: myTurn.legalCards[0] } as const);
    expect(await cs[0].emitWithAck('game:action', { action })).toEqual({ ok: true, data: undefined });
    expect(await cs[0].emitWithAck('room:addBot', { seat: 1 })).toEqual({ ok: false, error: 'GAME_IN_PROGRESS' });
  }, 15000);

  it('two humans: other seat cannot act out of turn; reconnect mid-game restores seat and state', async () => {
    const { cs, code, url } = await setupBots(2, { ...FAST_TIMING, msPerTimerSecond: 1000 });
    await cs[0].emitWithAck('room:start', {});
    await waitFor(() => cs[1].lastView(), 3000, 'view');
    const { turn } = await waitFor(() => {
      const v = cs[1].lastView();
      return v && (v.turn === 0 || v.turn === 1) ? { turn: v.turn } : undefined;
    }, 5000, 'human turn');
    const notOnTurn = cs[turn === 0 ? 1 : 0];
    const r = await notOnTurn.emitWithAck('game:action', { action: { type: 'bid', bid: { kind: 'pass' } } });
    expect(r).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });

    cs[1].disconnect();
    await waitFor(() => cs[0].lastRoom()?.seats[1].connected === false, 2000, 'disconnect seen');
    const back = await connect(url);
    clients.push(back);
    expect((await back.emitWithAck('room:join', { code, profile: profile('h1') })).ok).toBe(true);
    const v = await waitFor(() => back.lastView(), 2000, 'state after reconnect');
    expect(v.seat).toBe(1);
    expect(back.lastRoom()!.status).toBe('playing');
  }, 15000);

  it('late joiner spectates and gets a spectator view', async () => {
    const { cs, code, url } = await setupBots(1, { ...FAST_TIMING, msPerTimerSecond: 1000, botDelayMs: 50 });
    await cs[0].emitWithAck('room:start', {});
    const spec = await connect(url);
    clients.push(spec);
    expect((await spec.emitWithAck('room:join', { code, profile: profile('spec') })).ok).toBe(true);
    const v = await waitFor(() => spec.lastView(), 2000, 'spectator view');
    expect(v.seat).toBeNull();
    expect(v.hand).toEqual([]);
  }, 15000);

  it('leaving mid-game hands the seat to a bot; host can restart after finish', async () => {
    const { cs } = await setupBots(2);
    await cs[0].emitWithAck('room:start', {});
    await waitFor(() => cs[0].rooms.find((r) => r.status === 'playing'));
    expect((await cs[1].emitWithAck('room:leave', {})).ok).toBe(true);
    const v = await waitFor(() => (cs[0].lastRoom()?.seats[1].isBot ? cs[0].lastRoom() : undefined), 2000, 'bot takeover');
    expect(v.seats[1].connected).toBe(true);
    await waitFor(() => cs[0].rooms.find((r) => r.status === 'finished'), 20000, 'match end');
    expect((await cs[0].emitWithAck('room:start', {})).ok).toBe(true);
    await waitFor(() => cs[0].lastRoom()?.status === 'playing', 2000, 'restart');
  }, 30000);
});

describe('pause / AFK / ready-up over socket.io', () => {
  it('host pause validation, freeze/restore, GAME_PAUSED, imBack/ready errors', async () => {
    const { cs } = await setupBots(2, { ...FAST_TIMING, msPerTimerSecond: 1000 });
    const [a, b] = cs;
    expect(await a.emitWithAck('room:pause', { paused: true })).toEqual({ ok: false, error: 'NOT_PLAYING' });
    expect(await b.emitWithAck('game:ready', {})).toEqual({ ok: false, error: 'NOT_ROUND_END' });
    await a.emitWithAck('room:start', {});
    const lobbyFields = await waitFor(() => a.lastRoom()?.status === 'playing' && a.lastRoom());
    expect(lobbyFields).toMatchObject({ paused: false, pausedRemainingMs: null, afkSeats: [], roundReady: null });
    // wait for a human turn (seat 0 or 1) with a running timer
    const turnRoom = await waitFor(() => {
      const v = a.lastView();
      return v && (v.turn === 0 || v.turn === 1) && a.lastRoom()?.turnDeadline ? a.lastRoom() : undefined;
    }, 5000, 'human turn');
    const turn = a.lastView()!.turn as 0 | 1;
    expect(await a.emitWithAck('room:pause', { paused: 'yes' } as never)).toEqual({ ok: false, error: 'INVALID_PAUSE' });
    expect(await (a as any).emitWithAck('room:pause', 'garbage')).toEqual({ ok: false, error: 'INVALID_PAUSE' });
    expect(await b.emitWithAck('room:pause', { paused: true })).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(await a.emitWithAck('room:pause', { paused: true })).toEqual({ ok: true, data: undefined });
    const paused = await waitFor(() => b.lastRoom()?.paused && b.lastRoom(), 2000, 'paused');
    expect(paused.turnDeadline).toBeNull();
    expect(paused.pausedRemainingMs).toBeGreaterThan(0);
    expect(paused.pausedRemainingMs).toBeLessThanOrEqual(turnRoom.turnDeadline! - Date.now() + 50);
    const actor = cs[turn];
    const v = actor.lastView()!;
    const action = v.phase === 'bidding' ? ({ type: 'bid', bid: v.legalBids[0] } as const) : ({ type: 'play', card: v.legalCards[0] } as const);
    expect(await actor.emitWithAck('game:action', { action })).toEqual({ ok: false, error: 'GAME_PAUSED' });
    expect((await b.emitWithAck('chat:send', { text: 'brb' })).ok).toBe(true);
    expect(await b.emitWithAck('game:imBack', {})).toEqual({ ok: true, data: undefined }); // no-op when not AFK
    expect(await a.emitWithAck('room:pause', { paused: false })).toEqual({ ok: true, data: undefined });
    const resumed = await waitFor(() => (b.lastRoom()?.paused === false ? b.lastRoom() : undefined), 2000, 'resumed');
    expect(resumed.turnDeadline! - Date.now()).toBeLessThanOrEqual(paused.pausedRemainingMs! + 50);
    expect(await actor.emitWithAck('game:action', { action })).toEqual({ ok: true, data: undefined });
    // pause toggling has its own small token bucket
    const toggles = [];
    for (let i = 0; i < 6; i++) toggles.push(await a.emitWithAck('room:pause', { paused: i % 2 === 0 }));
    expect(toggles.some((r) => !r.ok && r.error === 'RATE_LIMITED')).toBe(true);
  }, 15000);

  it('timed-out human becomes AFK, is auto-played, and the match still finishes; imBack clears AFK', async () => {
    const { cs } = await setupBots(1);
    await cs[0].emitWithAck('room:start', {});
    await waitFor(() => cs[0].lastRoom()?.afkSeats.includes(0), 3000, 'AFK');
    expect(await cs[0].emitWithAck('game:imBack', {})).toEqual({ ok: true, data: undefined });
    await waitFor(() => cs[0].lastRoom()?.afkSeats.length === 0 && cs[0].lastRoom(), 2000, 'not AFK');
    const fin = await waitFor(() => cs[0].rooms.find((r) => r.status === 'finished'), 20000, 'match end');
    expect(fin).toMatchObject({ paused: false, afkSeats: [], roundReady: null });
  }, 30000);

  it('ready-up waits for a connected human who keeps playing', async () => {
    const { cs } = await setupBots(1, { ...FAST_TIMING, msPerTimerSecond: 1000, roundReadyTimeoutMs: 60_000 });
    const a = cs[0];
    // auto-respond on our turns so we never go AFK
    a.on('game:state', (v) => {
      if (v.turn !== 0 || a.lastRoom()?.paused) return;
      if (v.phase === 'bidding' && v.legalBids.length) void a.emitWithAck('game:action', { action: { type: 'bid', bid: v.legalBids[0] } });
      else if (v.phase === 'playing' && v.legalCards.length) void a.emitWithAck('game:action', { action: { type: 'play', card: v.legalCards[0] } });
    });
    await a.emitWithAck('room:start', {});
    const rr = await waitFor(() => a.lastRoom()?.roundReady, 10000, 'round end');
    expect(rr.readySeats).toEqual([1, 2, 3]);
    await new Promise((r) => setTimeout(r, 100));
    expect(a.lastView()!.phase).toBe('roundEnd');
    expect(a.lastRoom()!.afkSeats).toEqual([]);
    const mark = a.rooms.length;
    expect(await a.emitWithAck('game:ready', {})).toEqual({ ok: true, data: undefined });
    await waitFor(() => a.lastView()!.roundNumber >= 2, 2000, 'next round');
    // first state after ready shows seat 0 ready, then the deal clears roundReady
    const after = a.rooms.slice(mark);
    expect(after[0].roundReady?.readySeats).toEqual([0, 1, 2, 3]);
    expect(after.some((r) => r.roundReady === null)).toBe(true);
  }, 20000);
});

describe('Claim All over socket.io', () => {
  it('seat on turn claims via game:action; everyone gets the claimed event and the revealed hand', async () => {
    const { cs } = await setupBots(2, { ...FAST_TIMING, msPerTimerSecond: 1000, roundReadyTimeoutMs: 60_000 });
    const [a, b] = cs;
    const evA: GameEvent[] = [];
    const evB: GameEvent[] = [];
    a.on('game:events', (e) => evA.push(...e));
    b.on('game:events', (e) => evB.push(...e));
    expect(await a.emitWithAck('game:action', { action: { type: 'claim' } })).toEqual({ ok: false, error: 'NOT_PLAYING' });
    // strict payload: extra fields → INVALID_ACTION
    expect(await a.emitWithAck('game:action', { action: { type: 'claim', success: true } as never })).toEqual({ ok: false, error: 'INVALID_ACTION' });
    let claimAck: unknown;
    let claimedHand: number | null = null;
    // both humans bid/play on their turns; seat 0 claims on its first playing turn
    const readied = new Set<string>();
    for (const [i, c] of cs.entries()) {
      c.on('game:state', (v) => {
        if (claimAck !== undefined) return;
        // an earlier round ended without our claim (bot claim / all pass) → continue
        if (v.phase === 'roundEnd' && !readied.has(`${i}:${v.roundNumber}`)) {
          readied.add(`${i}:${v.roundNumber}`);
          void c.emitWithAck('game:ready', {});
          return;
        }
        if (v.turn !== i) return;
        if (v.phase === 'bidding' && v.legalBids.length) void c.emitWithAck('game:action', { action: { type: 'bid', bid: v.legalBids[0] } });
        else if (v.phase === 'playing' && i === 0 && v.canClaim) {
          claimAck = null;
          claimedHand = v.hand.length;
          void c.emitWithAck('game:action', { action: { type: 'claim' } }).then((r) => (claimAck = r));
        } else if (v.phase === 'playing' && v.legalCards.length) void c.emitWithAck('game:action', { action: { type: 'play', card: v.legalCards[0] } });
      });
    }
    await a.emitWithAck('room:start', {});
    await waitFor(() => claimAck, 10000, 'claim ack');
    expect(claimAck).toEqual({ ok: true, data: undefined });
    for (const [c, ev] of [[a, evA], [b, evB]] as const) {
      const claimed = await waitFor(() => ev.find((e) => e.type === 'claimed'), 2000, 'claimed event');
      if (claimed.type !== 'claimed') throw new Error('unreachable');
      expect(claimed.claim.seat).toBe(0);
      expect(claimed.claim.revealed).toHaveLength(claimedHand!);
      const v = await waitFor(() => (c.lastView()?.claim ? c.lastView() : undefined), 2000, 'view.claim');
      expect(v.claim!.revealed).toHaveLength(claimedHand!);
      expect(['roundEnd', 'matchEnd']).toContain(v.phase);
    }
  }, 20000);
});
