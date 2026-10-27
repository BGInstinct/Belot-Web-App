import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@belot/engine';
import { createSupabaseVerifier, type TokenVerifier } from './auth';
import { LIMITS, type GameTiming } from './config';
import { paymentsRouter } from './payments';
import { RoomManager } from './rooms/RoomManager';
import { registerSocketHandlers, type BelotServer } from './socket';

export interface AppOptions {
  /** allowed origins (comma separated in CLIENT_ORIGIN) */
  clientOrigin?: string | string[];
  timing?: Partial<GameTiming>;
  rng?: () => number;
  /** override token verification (tests); default: Supabase from env, or none */
  verifyToken?: TokenVerifier | null;
  /** mount the payments router (default true) */
  mountPayments?: boolean;
}

export interface BelotApp {
  app: Express;
  httpServer: HttpServer;
  io: BelotServer;
  rooms: RoomManager;
  listen(port: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export function parseOrigins(raw: string | string[] | undefined): string[] {
  const list = Array.isArray(raw) ? raw : (raw ?? 'http://localhost:5173').split(',');
  return list.map((s) => s.trim()).filter(Boolean);
}

export function createBelotServer(opts: AppOptions = {}): BelotApp {
  const origins = parseOrigins(opts.clientOrigin ?? process.env.CLIENT_ORIGIN);
  const corsOrigin = origins.includes('*') ? true : origins;
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: corsOrigin, credentials: true }));

  // NOTE: no global body parser on purpose — routers parse their own bodies (payments needs raw webhooks).
  const api = Router();
  api.get('/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.rooms.size, uptime: Math.round(process.uptime()) });
  });
  app.use('/api', api);
  if (opts.mountPayments !== false) app.use('/api', paymentsRouter);

  const httpServer = createHttpServer(app);
  const io: BelotServer = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
    maxHttpBufferSize: LIMITS.maxPayloadBytes,
  });

  const rooms = new RoomManager({
    timing: opts.timing,
    rng: opts.rng,
    transport: {
      emit: (socketId, ...msg) => {
        (io.to(socketId).emit as (...a: unknown[]) => boolean)(...msg);
      },
    },
  });

  const verify = opts.verifyToken !== undefined ? opts.verifyToken : createSupabaseVerifier();
  registerSocketHandlers(io, rooms, verify);

  return {
    app,
    httpServer,
    io,
    rooms,
    listen: (port, host) =>
      new Promise((resolve, reject) => {
        httpServer.once('error', reject);
        httpServer.listen(port, host, () => {
          const addr = httpServer.address();
          resolve(typeof addr === 'object' && addr ? addr.port : port);
        });
      }),
    close: () =>
      new Promise((resolve) => {
        rooms.closeAll();
        io.close(() => resolve());
      }),
  };
}
