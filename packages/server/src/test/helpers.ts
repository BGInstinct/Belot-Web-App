import { io as ioc, type Socket } from 'socket.io-client';
import {
  DEFAULT_SETTINGS,
  type ClientToServerEvents,
  type PlayerProfile,
  type PlayerView,
  type RoomView,
  type ServerToClientEvents,
} from '@belot/engine';
import { createBelotServer, type AppOptions, type BelotApp } from '../app';

export type Client = Socket<ServerToClientEvents, ClientToServerEvents> & {
  rooms: RoomView[];
  views: PlayerView[];
  chats: { from: string; text: string; at: number }[];
  closed: string[];
  lastRoom(): RoomView | undefined;
  lastView(): PlayerView | undefined;
};

export const FAST_TIMING = { botDelayMs: 1, trickPauseMs: 1, roundEndDelayMs: 1, roundReadyTimeoutMs: 20, emptyRoomTtlMs: 50, msPerTimerSecond: 1 };

export async function startServer(opts: AppOptions = {}): Promise<{ server: BelotApp; url: string }> {
  const server = createBelotServer({ verifyToken: null, mountPayments: false, timing: FAST_TIMING, ...opts });
  const port = await server.listen(0, '127.0.0.1');
  return { server, url: `http://127.0.0.1:${port}` };
}

export function profile(id: string, name = id): PlayerProfile {
  return { id, name, isGuest: true };
}

export async function connect(url: string): Promise<Client> {
  const s = ioc(url, { transports: ['websocket'], forceNew: true, reconnection: false }) as Client;
  s.rooms = [];
  s.views = [];
  s.chats = [];
  s.closed = [];
  s.lastRoom = () => s.rooms[s.rooms.length - 1];
  s.lastView = () => s.views[s.views.length - 1];
  s.on('room:state', (r) => s.rooms.push(r));
  s.on('game:state', (v) => s.views.push(v));
  s.on('chat:message', (m) => s.chats.push(m));
  s.on('room:closed', (r) => s.closed.push(r));
  await new Promise<void>((resolve, reject) => {
    s.once('connect', () => resolve());
    s.once('connect_error', reject);
  });
  return s;
}

export async function waitFor<T>(fn: () => T | undefined | null | false, timeoutMs = 3000, label = 'condition'): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

export const settings = (over: Partial<typeof DEFAULT_SETTINGS> = {}) => ({ ...DEFAULT_SETTINGS, ...over });

export async function createRoom(c: Client, p: PlayerProfile, s = settings()): Promise<string> {
  const r = await c.emitWithAck('room:create', { settings: s, profile: p });
  if (!r.ok) throw new Error(r.error);
  return r.data.code;
}
