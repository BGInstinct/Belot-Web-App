import type { Server, Socket } from 'socket.io';
import type { AckResult, ClientToServerEvents, PlayerProfile, ServerToClientEvents } from '@belot/engine';
import type { TokenVerifier } from './auth';
import { LIMITS } from './config';
import { TokenBucket } from './rateLimit';
import { RoomError } from './rooms/Room';
import type { RoomManager } from './rooms/RoomManager';
import { cleanText, parseAction, parseBoolean, parseProfile, parseSeat, parseSettings, parseToken } from './validation';

export type BelotServer = Server<ClientToServerEvents, ServerToClientEvents>;
type BelotSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
type Obj = Record<string, unknown>;

const asObj = (v: unknown): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : {});

function fail(code: string): never {
  throw new RoomError(code);
}

/** Resolve the identity for a create/join payload: verified Supabase user id if possible, else guest. */
async function resolveIdentity(
  rawProfile: unknown,
  rawToken: unknown,
  verify: TokenVerifier | null,
): Promise<{ profile: PlayerProfile; verified: boolean }> {
  const profile = parseProfile(rawProfile) ?? fail('INVALID_PROFILE');
  const token = parseToken(rawToken);
  if (token && verify) {
    const userId = await verify(token);
    if (userId) return { profile: { ...profile, id: userId, isGuest: false }, verified: true };
  }
  return { profile: { ...profile, isGuest: true }, verified: false };
}

export function registerSocketHandlers(io: BelotServer, rooms: RoomManager, verify: TokenVerifier | null): void {
  io.on('connection', (socket: BelotSocket) => {
    const events = new TokenBucket(LIMITS.eventBurst, LIMITS.eventRefillPerSec);
    const chat = new TokenBucket(LIMITS.chatBurst, LIMITS.chatRefillPerSec);
    const pause = new TokenBucket(LIMITS.pauseBurst, LIMITS.pauseRefillPerSec);

    /** Wraps a handler: rate-limit, catch errors, always ack exactly once (if an ack fn was given). */
    function handle<T>(
      event: keyof ClientToServerEvents,
      fn: (payload: Obj) => T | Promise<T>,
    ): void {
      (socket.on as (ev: string, listener: (...args: unknown[]) => void) => void)(event, async (...args: unknown[]) => {
        const ack = typeof args[args.length - 1] === 'function' ? (args[args.length - 1] as (r: AckResult<T>) => void) : null;
        const payload = asObj(args.length > 1 || !ack ? args[0] : undefined);
        let result: AckResult<T>;
        if (!events.take()) {
          result = { ok: false, error: 'RATE_LIMITED' };
        } else {
          try {
            result = { ok: true, data: await fn(payload) };
          } catch (err) {
            if (err instanceof RoomError) result = { ok: false, error: err.code };
            else {
              console.error(`[socket] ${event} failed`, err);
              result = { ok: false, error: 'SERVER_ERROR' };
            }
          }
        }
        try {
          ack?.(result);
        } catch {
          /* ignore */
        }
      });
    }

    handle('room:create', async (p) => {
      const settings = parseSettings(p.settings) ?? fail('INVALID_SETTINGS');
      const { profile, verified } = await resolveIdentity(p.profile, p.token, verify);
      if (!socket.connected) fail('DISCONNECTED');
      const room = rooms.create(socket.id, profile, verified, settings);
      return { code: room.code, playerId: profile.id };
    });

    handle('room:join', async (p) => {
      if (typeof p.code !== 'string') fail('INVALID_CODE');
      const { profile, verified } = await resolveIdentity(p.profile, p.token, verify);
      if (!socket.connected) fail('DISCONNECTED');
      const room = rooms.join(socket.id, p.code as string, profile, verified);
      return { code: room.code, playerId: profile.id };
    });

    handle('room:sit', (p) => {
      rooms.sit(socket.id, parseSeat(p.seat) ?? fail('INVALID_SEAT'));
      return undefined;
    });

    handle('room:addBot', (p) => {
      rooms.addBot(socket.id, parseSeat(p.seat) ?? fail('INVALID_SEAT'));
      return undefined;
    });

    handle('room:removeBot', (p) => {
      rooms.removeBot(socket.id, parseSeat(p.seat) ?? fail('INVALID_SEAT'));
      return undefined;
    });

    handle('room:updateSettings', (p) => {
      rooms.updateSettings(socket.id, parseSettings(p.settings) ?? fail('INVALID_SETTINGS'));
      return undefined;
    });

    handle('room:start', () => {
      rooms.start(socket.id);
      return undefined;
    });

    handle('room:leave', () => {
      rooms.leave(socket.id);
      return undefined;
    });

    handle('game:action', (p) => {
      rooms.action(socket.id, parseAction(p.action) ?? fail('INVALID_ACTION'));
      return undefined;
    });

    handle('room:pause', (p) => {
      const paused = parseBoolean(p.paused) ?? fail('INVALID_PAUSE');
      if (!pause.take()) fail('RATE_LIMITED');
      rooms.setPaused(socket.id, paused);
      return undefined;
    });

    handle('game:imBack', () => {
      rooms.imBack(socket.id);
      return undefined;
    });

    handle('game:ready', () => {
      rooms.ready(socket.id);
      return undefined;
    });

    handle('chat:send', (p) => {
      const text = cleanText(p.text, LIMITS.chatMaxLength) ?? fail('INVALID_MESSAGE');
      if (!chat.take()) fail('RATE_LIMITED');
      rooms.chat(socket.id, text);
      return undefined;
    });

    socket.on('disconnect', () => rooms.disconnect(socket.id));
  });
}
