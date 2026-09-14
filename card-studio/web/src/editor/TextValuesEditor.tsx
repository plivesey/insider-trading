import type { Template } from '../lib/types.js';

// Card-side: one plain text input per overlay slot defined on the
// template. Position, font size, color, and alignment are edited on the
// template (see templates/TextOverlayControls.tsx), not here.
export function TextValuesEditor({
  template,
  textValues,
  onChange
}: {
  template: Template | null;
  textValues: Record<string, string>;
  onChange: (textValues: Record<string, string>) => void;
}) {
  if (!template) {
    return <p className="hint">Select a template to edit its text.</p>;
  }
  if (template.textOverlays.length === 0) {
    return <p className="hint">This template has no text overlays yet — add them on the Templates page.</p>;
  }

  return (
    <div className="text-values-list">
      {template.textOverlays.map((o, i) => (
        <label key={o.id} className="field">
          Text {i + 1}
          <input
            type="text"
            value={textValues[o.id] ?? ''}
            onChange={(e) => onChange({ ...textValues, [o.id]: e.target.value })}
          />
        </label>
      ))}
    </div>
  );
}
