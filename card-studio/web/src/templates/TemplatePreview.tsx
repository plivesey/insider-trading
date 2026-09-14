import type { Template } from '../lib/types.js';
import { api } from '../lib/api.js';
import { boxStyle } from '../lib/pctBox.js';

// Shared visual preview for the Templates page — shows the art placement
// box and every text overlay box on top of the uploaded background, so
// ArtPlacementControls and TextOverlayControls can stay plain field forms.
export function TemplatePreview({ template }: { template: Template }) {
  return (
    <div
      className="placement-preview"
      style={{ aspectRatio: `${template.width} / ${template.height}` }}
    >
      <img src={api.templates.imageUrl(template.id, template.imageUpdatedAt)} alt={template.name} />
      <div className="placement-box art-box" style={boxStyle(template.artPlacement, template)} />
      {template.textOverlays.map((o, i) => (
        <div key={o.id} className="placement-box text-box" style={boxStyle(o, template)}>
          <span className="placement-box-label">Text {i + 1}</span>
        </div>
      ))}
    </div>
  );
}
