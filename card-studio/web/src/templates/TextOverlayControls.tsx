import { useState } from 'react';
import { newLocalId } from '../lib/newLocalId.js';
import type { TextAlign, TextOverlay, Template } from '../lib/types.js';
import { api } from '../lib/api.js';

const ALIGNS: TextAlign[] = ['left', 'center', 'right'];

function defaultOverlay(): TextOverlay {
  return { id: newLocalId(), x: 0, y: 0, w: 200, h: 60, fontSize: 32, color: '#1a1a1a', align: 'center' };
}

// Layout only (position/font size/color/align) — the text string itself is
// per-card (see editor/TextValuesEditor.tsx). Fire-and-persist, same
// convention as ArtPlacementControls: local state is the source of truth,
// the server response is never written back over it.
export function TextOverlayControls({
  template,
  onChange
}: {
  template: Template;
  onChange: (t: Template) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  function save(textOverlays: TextOverlay[]) {
    api.templates.patch(template.id, { textOverlays }).catch((e) => {
      setError((e as Error).message);
    });
  }

  function addOverlay() {
    const textOverlays = [...template.textOverlays, defaultOverlay()];
    onChange({ ...template, textOverlays });
    save(textOverlays);
  }

  function updateOverlay(id: string, patch: Partial<TextOverlay>) {
    const textOverlays = template.textOverlays.map((o) => (o.id === id ? { ...o, ...patch } : o));
    onChange({ ...template, textOverlays });
  }

  function removeOverlay(id: string) {
    const textOverlays = template.textOverlays.filter((o) => o.id !== id);
    onChange({ ...template, textOverlays });
    save(textOverlays);
  }

  return (
    <div className="text-overlay-list">
      {error && <p className="error">{error}</p>}
      {template.textOverlays.map((o, i) => (
        <div key={o.id} className="text-overlay-row">
          <span className="overlay-label">Text {i + 1}</span>
          {(['x', 'y', 'w', 'h', 'fontSize'] as const).map((key) => (
            <label key={key}>
              {key}
              <input
                type="number"
                value={o[key]}
                onChange={(e) => updateOverlay(o.id, { [key]: Number(e.target.value) })}
                onBlur={() => save(template.textOverlays)}
              />
            </label>
          ))}
          <label>
            color
            <input
              type="color"
              value={o.color}
              onChange={(e) => updateOverlay(o.id, { color: e.target.value })}
              onBlur={() => save(template.textOverlays)}
            />
          </label>
          <label>
            align
            <select
              value={o.align}
              onChange={(e) => {
                const align = e.target.value as TextAlign;
                const textOverlays = template.textOverlays.map((x) => (x.id === o.id ? { ...x, align } : x));
                onChange({ ...template, textOverlays });
                save(textOverlays);
              }}
            >
              {ALIGNS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <button className="danger" onClick={() => removeOverlay(o.id)}>
            Remove
          </button>
        </div>
      ))}
      <button onClick={addOverlay}>+ Add text overlay</button>
    </div>
  );
}
