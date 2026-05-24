import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { ServerHub } from './state/serverState.js';
import { createRouter } from './http/routes.js';
import { WsHub } from './http/ws.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(HERE, '..');

export interface StartedServer {
  server: http.Server;
  hub: ServerHub;
  wsHub: WsHub;
  app: express.Express;
  port: number;
}

export async function startServer(opts: {
  port?: number;
  snapshotPath?: string;
  logsDir?: string;
  cardsDir?: string;
  silent?: boolean;
  defaultSeed?: number;
} = {}): Promise<StartedServer> {
  const port = opts.port ?? Number(process.env.PORT ?? 4000);
  const snapshotPath = opts.snapshotPath ?? path.join(BACKEND_ROOT, 'game_state.json');
  const logsDir = opts.logsDir ?? path.join(BACKEND_ROOT, 'game_logs');
  const envSeed = process.env.SEED ? Number(process.env.SEED) : undefined;
  const defaultSeed = opts.defaultSeed ?? (Number.isFinite(envSeed) ? envSeed : undefined);

  const hub = new ServerHub({
    snapshotPath,
    logsDir,
    cardsDir: opts.cardsDir,
    defaultSeed
  });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, origin ?? true), // reflect origin for dev
      credentials: true
    })
  );
  const server = http.createServer(app);
  const wsHub = new WsHub(server, hub);

  // After every /api request, push current projected state to all WS clients.
  // Game-state mutations also broadcast via MutateQueue (which adds log events
  // too), but lobby joins and the lobby→in-game transition don't go through
  // the queue, so this catch-all keeps every tab in sync. Must be registered
  // before the router so res.on('finish') fires after the route's response.
  app.use('/api', (_req, res, next) => {
    res.on('finish', () => wsHub.rebroadcastLobby());
    next();
  });
  app.use('/api', createRouter(hub));
  app.get('/healthz', (_, res) => res.json({ ok: true }));

  return new Promise(resolve => {
    server.listen(port, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      if (!opts.silent) {
        // eslint-disable-next-line no-console
        console.log(`Insider Trading server listening on http://localhost:${actualPort}`);
      }
      resolve({ server, hub, wsHub, app, port: actualPort });
    });
  });
}

// Auto-start when run directly (tsx src/server.ts or compiled).
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(err => {
    // eslint-disable-next-line no-console
    console.error('Failed to start:', err);
    process.exit(1);
  });
}
