/** Server bootstrap. */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

// One .env at the repo root serves both server and client (Vite envDir points there too).
loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
import { createBelotServer } from './app';

const port = Number(process.env.PORT ?? 3001);
const server = createBelotServer();

server
  .listen(port)
  .then((p) => {
    const auth = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'supabase' : 'guest-only';
    console.log(`[belot] server listening on :${p} (auth: ${auth}, origin: ${process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'})`);
  })
  .catch((err) => {
    console.error('[belot] failed to start', err);
    process.exit(1);
  });

const shutdown = () => {
  server.close().finally(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
