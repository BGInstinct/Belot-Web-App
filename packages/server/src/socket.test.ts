/** Socket.io integration tests for room management (no gameplay → independent of the engine). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BelotApp } from './app';
import { connect, createRoom, profile, settings, startServer, waitFor, type Client } from './test/helpers';

let server: BelotApp;
let url: string;
const clients: Client[] = [];
const client = async () => {
  const c = await connect(url);
  clients.push(c);
  return c;
};

beforeEach(async () => {
  ({ server, url } = await startServer());
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.disconnect());
  await server.close();
});

describe('http', () => {
  it('GET /api/health', async () => {
    const res = await fetch(`${url}/api/health`, { headers: { Origin: 'http://localhost:5173' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });
});

describe('rooms over socket.io', () => {
  it('create + case-insensitive join + room:state broadcast', async () => {
    const a = await client();
    const b = await client();
    const code = await createRoom(a, profile('a', 'Ana'));
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const r = await b.emitWithAck('room:join', { code: code.toLowerCase(), profile: profile('b', 'Bo') });
    expect(r).toEqual({ ok: true, data: { code, playerId: 'b' } });
    const view = await waitFor(() => a.rooms.find((x) => x.seats[1].player?.id === 'b'));
    expect(view).toMatchObject({ code, hostId: 'a', status: 'lobby', turnDeadline: null });
    expect(view.seats[0]).toMatchObject({ seat: 0, isBot: false, connected: true, player: { name: 'Ana', isGuest: true } });
  });

  it('validates payloads', async () => {
    const a = await client();
    expect(await a.emitWithAck('room:create', { settings: { bad: 1 } as never, profile: profile('a') })).toEqual({ ok: false, error: 'INVALID_SETTINGS' });
    expect(await a.emitWithAck('room:create', { settings: settings(), profile: { id: '', name: 'x' } as never })).toEqual({ ok: false, error: 'INVALID_PROFILE' });
    expect(await a.emitWithAck('room:join', { code: 'ZZZZZZ', profile: profile('a') })).toEqual({ ok: false, error: 'ROOM_NOT_FOUND' });
    expect(await a.emitWithAck('room:sit', { seat: 1 })).toEqual({ ok: false, error: 'NOT_IN_ROOM' });
    await createRoom(a, profile('a'));
    expect(await a.emitWithAck('room:sit', { seat: 9 as never })).toEqual({ ok: false, error: 'INVALID_SEAT' });
    expect(await a.emitWithAck('game:action', { action: { type: 'nope' } as never })).toEqual({ ok: false, error: 'INVALID_ACTION' });
    expect(await a.emitWithAck('chat:send', { text: 'x'.repeat(500) })).toEqual({ ok: false, error: 'INVALID_MESSAGE' });
    expect(await a.emitWithAck('room:start', {})).toEqual({ ok: false, error: 'SEATS_NOT_FILLED' });
    // garbage payload shapes must not crash the handler
    expect(await (a as any).emitWithAck('room:sit', 'garbage')).toEqual({ ok: false, error: 'INVALID_SEAT' });
    (a as any).emit('room:sit'); // no ack, no payload
    expect((await a.emitWithAck('room:leave', {})).ok).toBe(true);
  });

  it('bots, sit, settings, host-only', async () => {
    const a = await client();
    const b = await client();
    const code = await createRoom(a, profile('a'));
    await b.emitWithAck('room:join', { code, profile: profile('b') });
    expect(await b.emitWithAck('room:addBot', { seat: 2 })).toEqual({ ok: false, error: 'NOT_HOST' });
    expect((await a.emitWithAck('room:addBot', { seat: 2 })).ok).toBe(true);
    expect((await b.emitWithAck('room:sit', { seat: 3 })).ok).toBe(true);
    expect((await a.emitWithAck('room:updateSettings', { settings: settings({ turnTimerSeconds: 60, manualAnnounceOnly: true }) })).ok).toBe(true);
    const v = await waitFor(() => b.lastRoom()?.settings.turnTimerSeconds === 60 && b.lastRoom());
    expect(v.seats.map((s) => (s.isBot ? 'bot' : s.player?.id ?? null))).toEqual(['a', null, 'bot', 'b']);
    expect((await a.emitWithAck('room:removeBot', { seat: 2 })).ok).toBe(true);
  });

  it('bot difficulty: set on create, host-only update in lobby, strict validation, default for old clients', async () => {
    const a = await client();
    const b = await client();
    const code = await createRoom(a, profile('a'), settings({ botDifficulty: 'hard' }));
    await b.emitWithAck('room:join', { code, profile: profile('b') });
    expect((await waitFor(() => b.lastRoom())).settings.botDifficulty).toBe('hard');
    expect(await b.emitWithAck('room:updateSettings', { settings: settings({ botDifficulty: 'easy' }) })).toEqual({ ok: false, error: 'NOT_HOST' });
    expect(await a.emitWithAck('room:updateSettings', { settings: settings({ botDifficulty: 'insane' as never }) })).toEqual({
      ok: false,
      error: 'INVALID_SETTINGS',
    });
    expect((await a.emitWithAck('room:updateSettings', { settings: settings({ botDifficulty: 'easy' }) })).ok).toBe(true);
    await waitFor(() => b.lastRoom()?.settings.botDifficulty === 'easy', 2000, 'easy');
    // an older client that does not send the field gets the default tier
    const { botDifficulty: _omit, ...legacy } = settings({ botDifficulty: 'hard' });
    expect((await a.emitWithAck('room:updateSettings', { settings: legacy as never })).ok).toBe(true);
    await waitFor(() => b.lastRoom()?.settings.botDifficulty === 'medium', 2000, 'default medium');
    expect(await a.emitWithAck('room:create', { settings: settings({ botDifficulty: 7 as never }), profile: profile('a') })).toEqual({
      ok: false,
      error: 'INVALID_SETTINGS',
    });
  });

  it('spectates when full; host transfers on leave', async () => {
    const [a, b, c, d, e] = await Promise.all([client(), client(), client(), client(), client()]);
    const code = await createRoom(a, profile('a'));
    for (const [cl, id] of [[b, 'b'], [c, 'c'], [d, 'd'], [e, 'e']] as const) {
      expect((await cl.emitWithAck('room:join', { code, profile: profile(id) })).ok).toBe(true);
    }
    const v = await waitFor(() => e.lastRoom());
    expect(v.seats.map((s) => s.player?.id)).toEqual(['a', 'b', 'c', 'd']);
    await a.emitWithAck('room:leave', {});
    const v2 = await waitFor(() => (b.lastRoom()?.hostId !== 'a' ? b.lastRoom() : undefined));
    expect(v2.hostId).toBe('b');
    expect(v2.seats[0].player).toBeNull();
    // spectator can now sit
    expect((await e.emitWithAck('room:sit', { seat: 0 })).ok).toBe(true);
  });

  it('reconnect with same profile id restores seat', async () => {
    const a = await client();
    const b = await client();
    const code = await createRoom(a, profile('a'));
    await b.emitWithAck('room:join', { code, profile: profile('b') });
    b.disconnect();
    await waitFor(() => a.lastRoom()?.seats[1].connected === false, 2000, 'b disconnected');
    const b2 = await client();
    expect(await b2.emitWithAck('room:join', { code, profile: profile('b') })).toEqual({ ok: true, data: { code, playerId: 'b' } });
    const v = await waitFor(() => b2.lastRoom());
    expect(v.seats[1]).toMatchObject({ connected: true, player: { id: 'b' } });
  });

  it('chat relay + spam guard', async () => {
    const a = await client();
    const b = await client();
    const code = await createRoom(a, profile('a', 'Ana'));
    await b.emitWithAck('room:join', { code, profile: profile('b', 'Bo') });
    expect((await a.emitWithAck('chat:send', { text: '  hello  ' })).ok).toBe(true);
    const m = await waitFor(() => b.chats[0]);
    expect(m).toMatchObject({ from: 'Ana', text: 'hello' });
    const results = [];
    for (let i = 0; i < 10; i++) results.push(await a.emitWithAck('chat:send', { text: `spam ${i}` }));
    expect(results.some((r) => !r.ok && r.error === 'RATE_LIMITED')).toBe(true);
  });

  it('closes empty rooms after the TTL', async () => {
    const a = await client();
    const code = await createRoom(a, profile('a'));
    a.disconnect();
    await waitFor(() => !server.rooms.rooms.has(code), 2000, 'room cleanup');
  });
});
