import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import type { GenerationSettings } from './types.js';

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCK_IMAGE_PATH = path.join(SERVER_ROOT, 'assets', 'mock-generation.png');

function mockEnabled(): boolean {
  return process.env.MOCK_OPENAI_IMAGES === 'true';
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Copy server/.env.example to server/.env and add your key.');
  }
  client = new OpenAI({ apiKey });
  return client;
}

export interface GeneratedImage {
  buffer: Buffer;
  // Matches settings.outputFormat, except in mock mode — the fixture file is
  // always a real PNG regardless of what outputFormat is configured to, so
  // the caller must use this (not settings.outputFormat) to name the file.
  extension: 'png' | 'jpeg' | 'webp';
}

export async function generateImage(prompt: string, settings: GenerationSettings): Promise<GeneratedImage> {
  // Set MOCK_OPENAI_IMAGES=true (in server/.env, or exported for a browser QA
  // run) to skip the real API entirely and always return the same fixture
  // image — no API key needed, no cost, deterministic for screenshots/tests.
  if (mockEnabled()) {
    return { buffer: await fs.readFile(MOCK_IMAGE_PATH), extension: 'png' };
  }

  const params: OpenAI.Images.ImageGenerateParams = {
    model: 'gpt-image-1',
    prompt,
    n: 1,
    size: settings.size,
    quality: settings.quality,
    background: settings.background,
    moderation: settings.moderation,
    output_format: settings.outputFormat
  };
  // Only meaningful for jpeg/webp — the API rejects it alongside png.
  if (settings.outputFormat !== 'png') {
    params.output_compression = settings.outputCompression;
  }

  const res = await getClient().images.generate(params);
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI did not return image data');
  return { buffer: Buffer.from(b64, 'base64'), extension: settings.outputFormat };
}
