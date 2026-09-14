import { Router } from 'express';
import multer from 'multer';
import { imageSize } from 'image-size';
import { asyncHandler } from '../asyncHandler.js';
import type { TextAlign, TextOverlay, Template } from '../types.js';
import {
  deleteTemplate,
  listCards,
  listTemplates,
  newId,
  readTemplate,
  reserveTemplateFile,
  templatePngPath,
  writeFileAtomic,
  writeTemplate
} from '../storage.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

const ALIGNS: TextAlign[] = ['left', 'center', 'right'];

function parseTextOverlays(input: unknown): TextOverlay[] {
  if (!Array.isArray(input)) throw new Error('textOverlays must be an array');
  return input.map((raw, i) => {
    const o = raw as Partial<TextOverlay>;
    for (const key of ['x', 'y', 'w', 'h', 'fontSize'] as const) {
      if (typeof o[key] !== 'number' || !Number.isFinite(o[key])) {
        throw new Error(`textOverlays[${i}].${key} must be a number`);
      }
    }
    if (typeof o.color !== 'string') throw new Error(`textOverlays[${i}].color must be a string`);
    const align = ALIGNS.includes(o.align as TextAlign) ? (o.align as TextAlign) : 'center';
    return {
      id: typeof o.id === 'string' && o.id ? o.id : newId(),
      x: o.x as number,
      y: o.y as number,
      w: o.w as number,
      h: o.h as number,
      fontSize: o.fontSize as number,
      color: o.color,
      align
    };
  });
}

export const templatesRouter = Router();

templatesRouter.get('/', (_req, res) => {
  res.json({ templates: listTemplates() });
});

templatesRouter.get('/:id', (req, res) => {
  const template = readTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json({ template });
});

templatesRouter.get('/:id/image', (req, res) => {
  const template = readTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  // Unlike generation images (append-only, immutable), a template's PNG can
  // be edited in place on disk at any time. No long-lived Cache-Control: the
  // frontend cache-busts with ?v=<imageUpdatedAt>, and this leaves `send`
  // free to answer conditional requests (ETag/Last-Modified) with a 304 or
  // fresh bytes based on the file's real mtime.
  res.sendFile(templatePngPath(template.id));
});

templatesRouter.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Missing file upload (field "file")' });
  if (file.mimetype !== 'image/png') {
    return res.status(400).json({ error: 'Only PNG templates are supported' });
  }

  let dims: { width?: number; height?: number };
  try {
    dims = imageSize(file.buffer);
  } catch (err) {
    return res.status(400).json({ error: `Could not read image: ${(err as Error).message}` });
  }
  if (!dims.width || !dims.height) {
    return res.status(400).json({ error: 'Could not determine image dimensions' });
  }

  const id = newId();
  const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim() : 'Untitled template';
  const createdAt = new Date().toISOString();
  const template: Template = {
    id,
    name,
    width: dims.width,
    height: dims.height,
    artPlacement: { x: 0, y: 0, w: dims.width, h: dims.height },
    textOverlays: [],
    createdAt,
    // Placeholder — writeTemplate never persists this field; readTemplate
    // recomputes it from the PNG's real mtime on every read.
    imageUpdatedAt: createdAt
  };

  const { pngPath } = reserveTemplateFile(name);
  await writeFileAtomic(pngPath, file.buffer);
  writeTemplate(template);
  res.status(201).json({ template: readTemplate(id) });
}));

templatesRouter.patch('/:id', (req, res) => {
  const template = readTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const body = req.body ?? {};
  if (typeof body.name === 'string' && body.name.trim()) {
    template.name = body.name.trim();
  }
  if (body.artPlacement && typeof body.artPlacement === 'object') {
    const { x, y, w, h } = body.artPlacement;
    if ([x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) {
      template.artPlacement = { x, y, w, h };
    } else {
      return res.status(400).json({ error: 'artPlacement must have numeric x, y, w, h' });
    }
  }
  if (body.textOverlays !== undefined) template.textOverlays = parseTextOverlays(body.textOverlays);

  writeTemplate(template);
  res.json({ template: readTemplate(template.id) });
});

templatesRouter.delete('/:id', (req, res) => {
  const template = readTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const force = req.query.force === 'true';
  const inUse = listCards().filter((c) => c.templateId === template.id);
  if (inUse.length > 0 && !force) {
    return res.status(409).json({
      error: `Template is used by ${inUse.length} card(s). Pass ?force=true to delete anyway.`,
      cardCount: inUse.length
    });
  }

  deleteTemplate(template.id);
  res.json({ ok: true });
});
