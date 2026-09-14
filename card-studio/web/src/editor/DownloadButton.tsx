import { useState } from 'react';
import type { Template } from '../lib/types.js';
import { api } from '../lib/api.js';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

// Mirrors CardPreview's DOM/CSS layering (boxStyle + object-fit: cover +
// flex-centered single-line text) as one-time canvas compositing at the
// template's native resolution, so the downloaded PNG matches what's on
// screen. Only run at export time — see CardPreview for the live version.
export function DownloadButton({
  template,
  artImageUrl,
  textValues
}: {
  template: Template | null;
  artImageUrl: string | null;
  textValues: Record<string, string>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    if (!template) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = template.width;
      canvas.height = template.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is not supported in this browser');

      const bgImg = await loadImage(api.templates.imageUrl(template.id));
      ctx.drawImage(bgImg, 0, 0, template.width, template.height);

      if (artImageUrl) {
        const artImg = await loadImage(artImageUrl);
        const box = template.artPlacement;
        // object-fit: cover — scale uniformly to fill the box, crop overflow.
        const scale = Math.max(box.w / artImg.naturalWidth, box.h / artImg.naturalHeight);
        const drawW = artImg.naturalWidth * scale;
        const drawH = artImg.naturalHeight * scale;
        const dx = box.x + (box.w - drawW) / 2;
        const dy = box.y + (box.h - drawH) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.w, box.h);
        ctx.clip();
        ctx.drawImage(artImg, dx, dy, drawW, drawH);
        ctx.restore();
      }

      for (const o of template.textOverlays) {
        const text = textValues[o.id] ?? '';
        if (!text) continue;
        ctx.save();
        ctx.beginPath();
        ctx.rect(o.x, o.y, o.w, o.h);
        ctx.clip();
        ctx.font = `600 ${o.fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = o.color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = o.align;
        const textX = o.align === 'left' ? o.x : o.align === 'right' ? o.x + o.w : o.x + o.w / 2;
        ctx.fillText(text, textX, o.y + o.h / 2);
        ctx.restore();
      }

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not encode PNG');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${template.name.replace(/[^a-z0-9-]+/gi, '-')}-card.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="download-button">
      <button onClick={handleDownload} disabled={!template || busy}>
        {busy ? 'Rendering…' : 'Download flattened PNG'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
