/**
 * Typed Socket.io client (OWNED BY online-play agent).
 * The socket is created lazily on first use and connects to the same origin (Vite proxies /socket.io
 * to the server in dev). Set VITE_SERVER_URL to point at a different origin.
 */
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@belot/engine';

export type BelotSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

type EventName = keyof ClientToServerEvents;
export type PayloadOf<E extends EventName> = Parameters<ClientToServerEvents[E]>[0];
type AckOf<E extends EventName> = Parameters<ClientToServerEvents[E]>[1] extends (r: infer R) => void ? R : never;
export type AckDataOf<E extends EventName> = AckOf<E> extends { ok: true; data: infer T } ? T : never;

let socket: BelotSocket | null = null;
const createListeners: ((s: BelotSocket) => void)[] = [];

/** Get (and lazily create) the shared socket. */
export function getSocket(): BelotSocket {
  if (!socket) {
    const url = (import.meta.env.VITE_SERVER_URL as string | undefined) || undefined;
    const opts = { autoConnect: true, reconnection: true, reconnectionDelay: 500, reconnectionDelayMax: 4000 };
    socket = (url ? io(url, opts) : io(opts)) as BelotSocket;
    for (const l of createListeners) l(socket);
  }
  return socket;
}

/** Run `fn` once the socket gets created (immediately if it already exists). Used to bind store handlers. */
export function onSocketCreated(fn: (s: BelotSocket) => void) {
  createListeners.push(fn);
  if (socket) fn(socket);
}

export class SocketRequestError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

/** Emit an event and resolve with the ack's `data`, rejecting with SocketRequestError on `{ ok: false }` / timeout. */
export function request<E extends EventName>(event: E, payload: PayloadOf<E>, timeoutMs = 10000): Promise<AckDataOf<E>> {
  const s = getSocket();
  return new Promise((resolve, reject) => {
    // socket.io's typed emit doesn't play well with a generic event name; the public signature above is typed.
    (s.timeout(timeoutMs) as unknown as { emit: (...a: unknown[]) => void }).emit(
      event,
      payload,
      (err: Error | null, res?: { ok: boolean; data?: unknown; error?: string }) => {
        if (err) return reject(new SocketRequestError('TIMEOUT'));
        if (!res) return reject(new SocketRequestError('NO_RESPONSE'));
        if (res.ok) resolve(res.data as AckDataOf<E>);
        else reject(new SocketRequestError(res.error ?? 'UNKNOWN'));
      },
    );
  });
}
