/** Pure room-management tests: no engine gameplay, no network. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type RoomView } from '@belot/engine';
import { DEFAULT_TIMING } from '../config';
import { profile } from '../test/helpers';
import { RoomError, type ServerMessage } from './Room';
import { RoomManager } from './RoomManager';

function setup() {
  const sent: { to: string; msg: ServerMessage }[] = [];
  const mgr = new RoomManager({ transport: { emit: (to, ...msg) => sent.push({ to, msg }) }, timing: DEFAULT_TIMING });
  const lastRoom = (sid: string): RoomView | undefined => {
    for (let i = sent.length - 1; i >= 0; i--) if (sent[i].to === sid && sent[i].msg[0] === 'room:state') return sent[i].msg[1] as RoomView;
    return undefined;
  };
  return { mgr, sent, lastRoom };
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

describe('Room management', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('creator is host and takes seat 0; joiners fill first free seats; full → spectator', () => {
    const { mgr, lastRoom } = setup();
    const room = mgr.create('s1', profile('a'), false, DEFAULT_SETTINGS);
    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    mgr.join('s2', room.code.toLowerCase(), profile('b'), false);
    mgr.addBot('s1', 3);
    mgr.join('s3', room.code, profile('c'), false);
    mgr.join('s4', room.code, profile('d'), false);
    const v = lastRoom('s1')!;
    expect(v.hostId).toBe('a');
    expect(v.seats.map((s) => s.player?.id)).toEqual(['a', 'b', 'c', `bot:${room.code}:3`]);
    expect(v.seats[3].isBot).toBe(true);
    expect(room.seatOfSocket('s4')).toBeNull();
    expect(room.memberProfile('s4')?.id).toBe('d'); // spectator
    expect(lastRoom('s4')).toBeDefined();
  });

  it('rejects bad codes / unknown rooms', () => {
    const { mgr } = setup();
    expect(err(() => mgr.join('s1', 'nope', profile('a'), false))).toBe('INVALID_CODE');
    expect(err(() => mgr.join('s1', 'ABCDEF', profile('a'), false))).toBe('ROOM_NOT_FOUND');
  });

  it('sit moves players and spectators to free seats in lobby', () => {
    const { mgr, lastRoom } = setup();
    const room = mgr.create('s1', profile('a'), false, DEFAULT_SETTINGS);
    mgr.sit('s1', 2);
    expect(lastRoom('s1')!.seats[2].player?.id).toBe('a');
    expect(lastRoom('s1')!.seats[0].player).toBeNull();
    mgr.join('s2', room.code, profile('b'), false);
    expect(room.seatOfSocket('s2')).toBe(0);
    expect(err(() => mgr.sit('s2', 2))).toBe('SEAT_TAKEN');
    mgr.addBot('s1', 1);
    mgr.addBot('s1', 3);
    mgr.join('s3', room.code, profile('c'), false); // spectator
    expect(err(() => mgr.sit('s3', 1))).toBe('SEAT_TAKEN');
    mgr.removeBot('s1', 1);
    mgr.sit('s3', 1);
    expect(room.seatOfSocket('s3')).toBe(1);
  });

  it('only host can manage bots/settings/start; start needs 4 seats', () => {
    const { mgr, lastRoom } = setup();
    const room = mgr.create('s1', profile('a'), false, DEFAULT_SETTINGS);
    mgr.join('s2', room.code, profile('b'), false);
    expect(err(() => mgr.addBot('s2', 2))).toBe('NOT_HOST');
    expect(err(() => mgr.updateSettings('s2', { ...DEFAULT_SETTINGS, turnTimerSeconds: 15 }))).toBe('NOT_HOST');
    expect(err(() => mgr.start('s2'))).toBe('NOT_HOST');
    expect(err(() => mgr.start('s1'))).toBe('SEATS_NOT_FILLED');
    expect(err(() => mgr.addBot('s1', 1))).toBe('SEAT_TAKEN');
    expect(err(() => mgr.removeBot('s1', 1))).toBe('NOT_A_BOT');
    mgr.updateSettings('s1', { ...DEFAULT_SETTINGS, turnTimerSeconds: 15 });
    expect(lastRoom('s2')!.settings.turnTimerSeconds).toBe(15);
  });

  it('host transfers when host leaves; room destroyed when last human leaves', () => {
    const { mgr, lastRoom, sent } = setup();
    const room = mgr.create('s1', profile('a'), false, DEFAULT_SETTINGS);
    mgr.join('s2', room.code, profile('b'), false);
    mgr.leave('s1');
    expect(lastRoom('s2')!.hostId).toBe('b');
    expect(lastRoom('s2')!.seats[0].player).toBeNull();
    mgr.leave('s2');
    expect(room.destroyed).toBe(true);
    expect(mgr.rooms.size).toBe(0);
    expect(sent.some((s) => s.msg[0] === 'room:closed')).toBe(false); // nobody left to notify
  });

  it('reconnection: same profile id reclaims seat; old socket is detached', () => {
    const { mgr, lastRoom, sent } = setup();
    const room = mgr.create('s1', profile('a'), false, DEFAULT_SETTINGS);
    mgr.join('s2', room.code, profile('b'), false);
    mgr.disconnect('s2');
    expect(lastRoom('s1')!.seats[1]).toMatchObject({ connected: false, player: { id: 'b' } });
    mgr.join('s2b', room.code, profile('b', 'Bobby'), false);
    expect(room.seatOfSocket('s2b')).toBe(1);
    expect(lastRoom('s1')!.seats[1]).toMatchObject({ connected: true, player: { name: 'Bobby' } });
    // live duplicate tab: newest wins, older one is told it was replaced
    mgr.join('s2c', room.code, profile('b'), false);
    expect(room.seatOfSocket('s2c')).toBe(1);
    expect(sent.some((s) => s.to === 's2b' && s.msg[0] === 'room:closed' && s.msg[1] === 'replaced')).toBe(true);
    expect(mgr.roomOf('s2b')).toBeUndefined();
  });

  it('verified identities cannot be hijacked by guests with the same id', () => {
    const { mgr } = setup();
    const room = mgr.create('s1', profile('user-1'), true, DEFAULT_SETTINGS);
    mgr.disconnect('s1');
    expect(err(() => mgr.join('evil', room.code, profile('user-1'), false))).toBe('IDENTITY_MISMATCH');
    mgr.join('s1b', room.code, profile('user-1'), true);
    expect(room.seatOfSocket('s1b')).toBe(0);
  });

  it('host transfers to a connected human on disconnect', () => {
    const { mgr, lastRoom } = setup();
    const room = mgr.create('s1', profile('a'), false, DEFAULT_SETTINGS);
    mgr.join('s2', room.code, profile('b'), false);
    mgr.disconnect('s1');
    expect(lastRoom('s2')!.hostId).toBe('b');
  });

  it('rooms with no connected humans are cleaned up after the TTL', () => {
    const { mgr } = setup();
    const room = mgr.create('s1', profile('a'), false, DEFAULT_SETTINGS);
    mgr.disconnect('s1');
    vi.advanceTimersByTime(DEFAULT_TIMING.emptyRoomTtlMs - 1000);
    expect(room.destroyed).toBe(false);
    mgr.join('s1b', room.code, profile('a'), false); // came back in time
    mgr.disconnect('s1b');
    vi.advanceTimersByTime(DEFAULT_TIMING.emptyRoomTtlMs - 1000);
    expect(room.destroyed).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(room.destroyed).toBe(true);
    expect(mgr.rooms.size).toBe(0);
  });

  it('a socket is in one room at a time', () => {
    const { mgr } = setup();
    const r1 = mgr.create('s1', profile('a'), false, DEFAULT_SETTINGS);
    const r2 = mgr.create('s2', profile('b'), false, DEFAULT_SETTINGS);
    mgr.join('s1', r2.code, profile('a'), false);
    expect(r1.destroyed).toBe(true);
    expect(r2.seatOfSocket('s1')).toBe(1);
  });

  it('game actions rejected in lobby', () => {
    const { mgr } = setup();
    mgr.create('s1', profile('a'), false, DEFAULT_SETTINGS);
    expect(err(() => mgr.action('s1', { type: 'bid', bid: { kind: 'pass' } }))).toBe('NOT_PLAYING');
    expect(err(() => mgr.action('nobody', { type: 'bid', bid: { kind: 'pass' } }))).toBe('NOT_IN_ROOM');
  });

  it('chat relays sender name to all members', () => {
    const { mgr, sent } = setup();
    const room = mgr.create('s1', profile('a', 'Ana'), false, DEFAULT_SETTINGS);
    mgr.join('s2', room.code, profile('b'), false);
    mgr.chat('s2', 'здравей');
    const msgs = sent.filter((s) => s.msg[0] === 'chat:message');
    expect(msgs.map((m) => m.to).sort()).toEqual(['s1', 's2']);
    expect(msgs[0].msg[1]).toMatchObject({ from: 'b', text: 'здравей' });
  });
});
