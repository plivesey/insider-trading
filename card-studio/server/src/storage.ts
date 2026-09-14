import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { Card, CardSummary, GenerationSettings, Template } from './types.js';

const SAFE_ID = /^[a-zA-Z0-9-]+$/;
const SAFE_FILENAME = /^[a-zA-Z0-9-]+\.[a-zA-Z0-9]+$/;

let cachedDataDir: string | null = null;

export function getDataDir(): string {
  if (cachedDataDir) return cachedDataDir;
  const raw = process.env.DATA_DIR;
  if (!raw) {
    throw new Error(
      'DATA_DIR is not set. Copy server/.env.example to server/.env and set DATA_DIR ' +
        '(point it at a local folder — e.g. your Google Drive Desktop sync folder — to share data with a teammate).'
    );
  }
  cachedDataDir = path.resolve(raw);
  return cachedDataDir;
}

export function ensureDataDirLayout(): void {
  fs.mkdirSync(templatesDir(), { recursive: true });
  fs.mkdirSync(cardsDir(), { recursive: true });
}

export function newId(): string {
  return uuidv4();
}

export function assertSafeId(id: string): void {
  if (!SAFE_ID.test(id)) {
    throw new Error(`Invalid id: ${id}`);
  }
}

// --- Path builders -----------------------------------------------------

export function templatesDir(): string {
  return path.join(getDataDir(), 'templates');
}

export function cardsDir(): string {
  return path.join(getDataDir(), 'cards');
}

export function cardDir(id: string): string {
  assertSafeId(id);
  return path.join(cardsDir(), id);
}

export function cardJsonPath(id: string): string {
  return path.join(cardDir(id), 'card.json');
}

export function generationsDir(id: string): string {
  return path.join(cardDir(id), 'generations');
}

// `filename` is the generation's full stored filename (e.g. `<id>.png` or
// `<id>.webp` — output format is a GenerationSettings choice, not always
// png), taken from GenerationRecord.filename so the extension always
// matches the bytes actually written.
export function generationFilePath(cardId: string, filename: string): string {
  if (!SAFE_FILENAME.test(filename)) {
    throw new Error(`Invalid generation filename: ${filename}`);
  }
  return path.join(generationsDir(cardId), filename);
}

export function settingsJsonPath(): string {
  return path.join(getDataDir(), 'settings.json');
}

// --- Atomic writes -------------------------------------------------------
// Write to a uniquely-named tmp file in the same directory, then rename into
// place. Guards against a concurrent Google Drive sync reading a half-written
// file — the rename is atomic on the same filesystem, so readers only ever
// see either the old complete file or the new complete file.

function writeJsonAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${newId()}`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

export async function writeFileAtomic(filePath: string, data: Buffer): Promise<void> {
  const dir = path.dirname(filePath);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${newId()}`);
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, filePath);
}

// --- Templates -------------------------------------------------------
//
// Template files are named from the template's `name` (e.g. "Steel
// Border.json" / "Steel Border.png"), not its id, so they're recognizable
// when browsing the synced Drive folder directly and can be renamed by
// renaming the template in the app. The id (embedded in the JSON) is the
// only stable identifier — cards reference it, never a filename — so
// renaming on disk never breaks a card's `templateId`. Because filename no
// longer determines id, looking a template up by id means scanning the
// directory's JSON files for a content match; template counts for this tool
// are small (dozens, not thousands), so a linear scan is fine.

const WINDOWS_UNSAFE_CHARS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|']);

function templateBaseNameFor(name: string): string {
  const cleaned = name
    .trim()
    .split('')
    .map((ch) => (WINDOWS_UNSAFE_CHARS.has(ch) || ch.charCodeAt(0) < 0x20 ? '-' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '');
  return cleaned || 'Untitled template';
}

// Appends " (2)", " (3)", etc. until the name doesn't collide with an
// existing `<name>.json` in the templates dir. `excludeBaseName` lets a
// rename check against everyone else's filename without colliding with its
// own current file.
function uniqueTemplateBaseName(desired: string, excludeBaseName?: string): string {
  const dir = templatesDir();
  const existing = new Set(
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => f.endsWith('.json'))
          .map((f) => f.slice(0, -'.json'.length))
      : []
  );
  if (excludeBaseName) existing.delete(excludeBaseName);
  if (!existing.has(desired)) return desired;
  let i = 2;
  while (existing.has(`${desired} (${i})`)) i++;
  return `${desired} (${i})`;
}

interface TemplateFileLocation {
  baseName: string;
  jsonPath: string;
  pngPath: string;
}

function findTemplateFile(id: string): TemplateFileLocation | null {
  const dir = templatesDir();
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    const jsonPath = path.join(dir, entry);
    let data: Template;
    try {
      data = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as Template;
    } catch {
      continue;
    }
    if (data.id === id) {
      const baseName = entry.slice(0, -'.json'.length);
      return { baseName, jsonPath, pngPath: path.join(dir, `${baseName}.png`) };
    }
  }
  return null;
}

function imageUpdatedAtFor(pngPath: string, fallback: string): string {
  try {
    return fs.statSync(pngPath).mtime.toISOString();
  } catch {
    return fallback;
  }
}

function stripComputedFields(template: Template): Omit<Template, 'imageUpdatedAt'> {
  const { imageUpdatedAt: _imageUpdatedAt, ...rest } = template;
  return rest;
}

export function templatePngPath(id: string): string {
  const loc = findTemplateFile(id);
  if (!loc) throw new Error(`Template not found: ${id}`);
  return loc.pngPath;
}

// Reserves a name-derived basename for a brand-new template and returns the
// path the caller should write its uploaded PNG bytes to. Call before
// writeTemplate so the json and png land under the same basename.
export function reserveTemplateFile(name: string): { pngPath: string } {
  const dir = templatesDir();
  fs.mkdirSync(dir, { recursive: true });
  const baseName = uniqueTemplateBaseName(templateBaseNameFor(name));
  return { pngPath: path.join(dir, `${baseName}.png`) };
}

export function readTemplate(id: string): Template | null {
  const loc = findTemplateFile(id);
  if (!loc) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(loc.jsonPath, 'utf8')) as Template;
    return { ...raw, imageUpdatedAt: imageUpdatedAtFor(loc.pngPath, raw.createdAt) };
  } catch (err) {
    console.warn(`Skipping unreadable template ${id}: ${(err as Error).message}`);
    return null;
  }
}

// Persists field changes for an existing template, or creates one on disk
// for the first time (paired with reserveTemplateFile, whose basename this
// re-derives from the same name). If `name` changed since the last save,
// the json/png files are renamed to match (deduplicated) so filenames stay
// human-readable after an in-app rename.
export function writeTemplate(template: Template): void {
  const dir = templatesDir();
  fs.mkdirSync(dir, { recursive: true });
  const persisted = stripComputedFields(template);
  const loc = findTemplateFile(template.id);

  if (!loc) {
    const baseName = uniqueTemplateBaseName(templateBaseNameFor(template.name));
    writeJsonAtomic(path.join(dir, `${baseName}.json`), persisted);
    return;
  }

  const desiredBaseName = templateBaseNameFor(template.name);
  if (desiredBaseName === loc.baseName) {
    writeJsonAtomic(loc.jsonPath, persisted);
    return;
  }

  const newBaseName = uniqueTemplateBaseName(desiredBaseName, loc.baseName);
  const newJsonPath = path.join(dir, `${newBaseName}.json`);
  const newPngPath = path.join(dir, `${newBaseName}.png`);
  if (fs.existsSync(loc.pngPath)) fs.renameSync(loc.pngPath, newPngPath);
  writeJsonAtomic(newJsonPath, persisted);
  if (fs.existsSync(loc.jsonPath)) fs.rmSync(loc.jsonPath, { force: true });
}

export function listTemplates(): Template[] {
  const dir = templatesDir();
  if (!fs.existsSync(dir)) return [];
  const templates: Template[] = [];
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    const baseName = entry.slice(0, -'.json'.length);
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8')) as Template;
      const pngPath = path.join(dir, `${baseName}.png`);
      templates.push({ ...raw, imageUpdatedAt: imageUpdatedAtFor(pngPath, raw.createdAt) });
    } catch (err) {
      console.warn(`Skipping unreadable template file ${entry}: ${(err as Error).message}`);
    }
  }
  templates.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return templates;
}

export function deleteTemplate(id: string): void {
  const loc = findTemplateFile(id);
  if (!loc) return;
  if (fs.existsSync(loc.jsonPath)) fs.unlinkSync(loc.jsonPath);
  if (fs.existsSync(loc.pngPath)) fs.unlinkSync(loc.pngPath);
}

// --- Cards -------------------------------------------------------

export function readCard(id: string): Card | null {
  const p = cardJsonPath(id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Card;
  } catch (err) {
    console.warn(`Skipping unreadable card ${id}: ${(err as Error).message}`);
    return null;
  }
}

export function writeCard(card: Card): void {
  writeJsonAtomic(cardJsonPath(card.id), card);
}

export function toCardSummary(card: Card): CardSummary {
  return {
    id: card.id,
    name: card.name,
    prompt: card.prompt,
    templateId: card.templateId,
    selectedGenerationId: card.selectedGenerationId,
    updatedAt: card.updatedAt,
    generationCount: card.generations.length
  };
}

export function listCards(): CardSummary[] {
  const dir = cardsDir();
  if (!fs.existsSync(dir)) return [];
  const cards: CardSummary[] = [];
  for (const id of fs.readdirSync(dir)) {
    if (!SAFE_ID.test(id)) continue;
    const card = readCard(id);
    if (card) cards.push(toCardSummary(card));
  }
  cards.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return cards;
}

export function deleteCard(id: string): void {
  const dir = cardDir(id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// --- Settings -------------------------------------------------------

export const DEFAULT_SETTINGS: GenerationSettings = {
  size: '1024x1536',
  quality: 'auto',
  background: 'auto',
  outputFormat: 'png',
  outputCompression: 100,
  moderation: 'auto'
};

export function readSettings(): GenerationSettings {
  const p = settingsJsonPath();
  if (!fs.existsSync(p)) return DEFAULT_SETTINGS;
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<GenerationSettings>;
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch (err) {
    console.warn(`Skipping unreadable settings.json: ${(err as Error).message}`);
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: GenerationSettings): void {
  writeJsonAtomic(settingsJsonPath(), settings);
}
