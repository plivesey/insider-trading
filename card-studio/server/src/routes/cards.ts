import { Router } from 'express';
import OpenAI from 'openai';
import type { Card, GenerationRecord } from '../types.js';
import {
  deleteCard,
  generationFilePath,
  listCards,
  newId,
  readCard,
  readSettings,
  writeCard,
  writeFileAtomic
} from '../storage.js';
import { generateImage } from '../openaiClient.js';
import { asyncHandler } from '../asyncHandler.js';

export const cardsRouter = Router();

// Layout (position/font/color/align) lives on the template's TextOverlay;
// a card only supplies the string for each overlay id.
function parseTextValues(input: unknown): Record<string, string> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('textValues must be an object');
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== 'string') throw new Error(`textValues.${key} must be a string`);
    out[key] = value;
  }
  return out;
}

cardsRouter.get('/', (_req, res) => {
  res.json({ cards: listCards() });
});

cardsRouter.post('/', (req, res) => {
  const body = req.body ?? {};
  const now = new Date().toISOString();
  const card: Card = {
    id: newId(),
    name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Untitled card',
    prompt: '',
    templateId: null,
    textValues: {},
    generations: [],
    selectedGenerationId: null,
    createdAt: now,
    updatedAt: now
  };
  writeCard(card);
  res.status(201).json({ card });
});

cardsRouter.get('/:id', (req, res) => {
  const card = readCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  res.json({ card });
});

cardsRouter.patch('/:id', (req, res) => {
  const card = readCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const body = req.body ?? {};
  if (typeof body.name === 'string' && body.name.trim()) card.name = body.name.trim();
  if (typeof body.prompt === 'string') card.prompt = body.prompt;
  if (body.templateId === null || typeof body.templateId === 'string') card.templateId = body.templateId;
  if (body.textValues !== undefined) card.textValues = parseTextValues(body.textValues);

  card.updatedAt = new Date().toISOString();
  writeCard(card);
  res.json({ card });
});

cardsRouter.delete('/:id', (req, res) => {
  const card = readCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  deleteCard(card.id);
  res.json({ ok: true });
});

cardsRouter.get('/:id/generations/:genId/image', (req, res) => {
  const card = readCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });
  const generation = card.generations.find((g) => g.id === req.params.genId);
  if (!generation) return res.status(404).json({ error: 'Generation not found' });
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(generationFilePath(card.id, generation.filename));
});

cardsRouter.post(
  '/:id/generate',
  asyncHandler(async (req, res) => {
    const card = readCard(req.params.id);
    if (!card) return res.status(404).json({ error: 'Card not found' });

    const body = req.body ?? {};
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) return res.status(400).json({ error: 'Prompt is empty' });
    const settings = readSettings();

    let image: Awaited<ReturnType<typeof generateImage>>;
    try {
      image = await generateImage(prompt, settings);
    } catch (err) {
      // Preserve OpenAI's HTTP status (e.g. 403 org-not-verified for
      // gpt-image-1) instead of collapsing every failure to the same code —
      // that distinction is the first thing worth surfacing to the user.
      const status = err instanceof OpenAI.APIError && err.status ? err.status : 502;
      const message = err instanceof Error ? err.message : String(err);
      return res.status(status).json({ error: `OpenAI image generation failed: ${message}` });
    }

    const generationId = newId();
    const filename = `${generationId}.${image.extension}`;
    await writeFileAtomic(generationFilePath(card.id, filename), image.buffer);

    const generation: GenerationRecord = {
      id: generationId,
      filename,
      prompt,
      createdAt: new Date().toISOString(),
      model: 'gpt-image-1',
      size: settings.size
    };
    card.generations.push(generation);
    if (!card.selectedGenerationId) card.selectedGenerationId = generationId;
    card.prompt = prompt;
    card.updatedAt = new Date().toISOString();
    writeCard(card);

    res.status(201).json({ card, generation });
  })
);

cardsRouter.post('/:id/select-generation', (req, res) => {
  const card = readCard(req.params.id);
  if (!card) return res.status(404).json({ error: 'Card not found' });

  const generationId = req.body?.generationId;
  if (typeof generationId !== 'string' || !card.generations.some((g) => g.id === generationId)) {
    return res.status(400).json({ error: 'Unknown generationId' });
  }
  card.selectedGenerationId = generationId;
  card.updatedAt = new Date().toISOString();
  writeCard(card);
  res.json({ card });
});
