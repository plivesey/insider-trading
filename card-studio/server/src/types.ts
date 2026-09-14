export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type TextAlign = 'left' | 'center' | 'right';

// Layout only — position, font size, color, alignment. Lives on the
// Template because every card sharing a template shares the same text
// layout (mirrors artPlacement); the actual string per overlay is
// per-card, keyed by this id, in Card.textValues.
export interface TextOverlay extends Box {
  id: string;
  fontSize: number;
  color: string;
  align: TextAlign;
}

export interface GenerationRecord {
  id: string;
  filename: string;
  prompt: string;
  createdAt: string;
  model: string;
  size: string;
}

export interface Template {
  id: string;
  name: string;
  width: number;
  height: number;
  artPlacement: Box;
  textOverlays: TextOverlay[];
  createdAt: string;
  // Computed from the PNG file's on-disk mtime on every read, not stored —
  // lets the frontend cache-bust its <img> src when the file is edited
  // directly on disk (e.g. in the synced Drive folder) rather than through
  // the app. See storage.ts's imageUpdatedAtFor / stripComputedFields.
  imageUpdatedAt: string;
}

export interface Card {
  id: string;
  name: string;
  prompt: string;
  templateId: string | null;
  // Keyed by TextOverlay.id on the card's template. Overlays with no entry
  // (or entries left over from a since-removed overlay) render as empty.
  textValues: Record<string, string>;
  generations: GenerationRecord[];
  selectedGenerationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CardSummary = Pick<
  Card,
  'id' | 'name' | 'prompt' | 'templateId' | 'selectedGenerationId' | 'updatedAt'
> & { generationCount: number };

// Global, shared image-generation defaults — one settings.json under
// DATA_DIR, synced via Drive like everything else, so both teammates
// generate with the same parameters. Mirrors the subset of OpenAI's
// gpt-image-1 `images.generate` params that make sense to tune here: `n`,
// `model`, `response_format`, `style`, and `user` are excluded because the
// app hardcodes gpt-image-1 (n=1 — only one GenerationRecord is created per
// call; style/response_format are dall-e-only; user is an abuse-monitoring
// id, not a creative parameter).
export interface GenerationSettings {
  size: 'auto' | '1024x1024' | '1536x1024' | '1024x1536';
  quality: 'auto' | 'low' | 'medium' | 'high';
  background: 'auto' | 'opaque' | 'transparent';
  outputFormat: 'png' | 'jpeg' | 'webp';
  // 0-100. Only applies when outputFormat is 'jpeg' or 'webp'.
  outputCompression: number;
  moderation: 'auto' | 'low';
}
