import { Router } from 'express';
import type { GenerationSettings } from '../types.js';
import { readSettings, writeSettings } from '../storage.js';

const SIZES: GenerationSettings['size'][] = ['auto', '1024x1024', '1536x1024', '1024x1536'];
const QUALITIES: GenerationSettings['quality'][] = ['auto', 'low', 'medium', 'high'];
const BACKGROUNDS: GenerationSettings['background'][] = ['auto', 'opaque', 'transparent'];
const OUTPUT_FORMATS: GenerationSettings['outputFormat'][] = ['png', 'jpeg', 'webp'];
const MODERATIONS: GenerationSettings['moderation'][] = ['auto', 'low'];

function parseSettings(body: Record<string, unknown>, current: GenerationSettings): GenerationSettings {
  const next = { ...current };
  if (SIZES.includes(body.size as GenerationSettings['size'])) next.size = body.size as GenerationSettings['size'];
  if (QUALITIES.includes(body.quality as GenerationSettings['quality'])) {
    next.quality = body.quality as GenerationSettings['quality'];
  }
  if (BACKGROUNDS.includes(body.background as GenerationSettings['background'])) {
    next.background = body.background as GenerationSettings['background'];
  }
  if (OUTPUT_FORMATS.includes(body.outputFormat as GenerationSettings['outputFormat'])) {
    next.outputFormat = body.outputFormat as GenerationSettings['outputFormat'];
  }
  if (MODERATIONS.includes(body.moderation as GenerationSettings['moderation'])) {
    next.moderation = body.moderation as GenerationSettings['moderation'];
  }
  if (typeof body.outputCompression === 'number' && Number.isFinite(body.outputCompression)) {
    next.outputCompression = Math.min(100, Math.max(0, Math.round(body.outputCompression)));
  }
  return next;
}

export const settingsRouter = Router();

settingsRouter.get('/', (_req, res) => {
  res.json({ settings: readSettings() });
});

settingsRouter.patch('/', (req, res) => {
  const settings = parseSettings(req.body ?? {}, readSettings());
  writeSettings(settings);
  res.json({ settings });
});
