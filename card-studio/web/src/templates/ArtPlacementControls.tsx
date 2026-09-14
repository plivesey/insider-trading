import { useState } from 'react';
import type { Box, Template } from '../lib/types.js';
import { api } from '../lib/api.js';

export function ArtPlacementControls({
  template,
  onChange
}: {
  template: Template;
  onChange: (t: Template) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  function setField(key: keyof Box, value: number) {
    const artPlacement = { ...template.artPlacement, [key]: value };
    onChange({ ...template, artPlacement });
  }

  // Fire-and-persist: never write the server's response back into local
  // state. If two field saves race (e.g. blurring X then editing H before
  // X's request resolves), an in-flight save's stale response must not
  // overwrite a newer local edit — local state is the source of truth.
  function save() {
    api.templates.patch(template.id, { artPlacement: template.artPlacement }).catch((e) => {
      setError((e as Error).message);
    });
  }

  return (
    <div className="placement-controls">
      {error && <p className="error">{error}</p>}
      <div className="placement-fields">
        {(['x', 'y', 'w', 'h'] as const).map((key) => (
          <label key={key}>
            {key.toUpperCase()}
            <input
              type="number"
              value={template.artPlacement[key]}
              onChange={(e) => setField(key, Number(e.target.value))}
              onBlur={save}
            />
          </label>
        ))}
      </div>
      <p className="hint">
        Art is cropped to fill this box (no stretching) — {template.width}×{template.height}px canvas.
      </p>
    </div>
  );
}
