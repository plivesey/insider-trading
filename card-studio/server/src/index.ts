import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { ensureDataDirLayout, getDataDir } from './storage.js';
import { templatesRouter } from './routes/templates.js';
import { cardsRouter } from './routes/cards.js';
import { settingsRouter } from './routes/settings.js';

const port = Number(process.env.PORT ?? 4100);

ensureDataDirLayout();
console.log(`Card Studio data dir: ${getDataDir()}`);

const app = express();
app.use(express.json());
app.use(cors());

app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.use('/api/templates', templatesRouter);
app.use('/api/cards', cardsRouter);
app.use('/api/settings', settingsRouter);

// Catches both sync throws in route handlers (Express 4 forwards these
// automatically) and async rejections forwarded via asyncHandler. Always
// JSON, never Express's default HTML error page — this is a local API tool,
// not a page-serving app, and the frontend's api.ts expects `{error}` JSON.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  res.status(400).json({ error: message });
});

app.listen(port, () => {
  console.log(`Card Studio server listening on http://localhost:${port}`);
});
