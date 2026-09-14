import type { TextAlign, Template } from '../lib/types.js';
import { api } from '../lib/api.js';
import { boxStyle, fontSizeCqw } from '../lib/pctBox.js';

const ALIGN_TO_JUSTIFY: Record<TextAlign, string> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end'
};

export function CardPreview({
  template,
  artImageUrl,
  textValues
}: {
  template: Template | null;
  artImageUrl: string | null;
  textValues: Record<string, string>;
}) {
  if (!template) {
    return <div className="card-preview-empty">Select a template to see a preview.</div>;
  }

  return (
    <div
      className="card-preview-frame"
      style={{ aspectRatio: `${template.width} / ${template.height}` }}
    >
      <img
        className="preview-bg"
        src={api.templates.imageUrl(template.id, template.imageUpdatedAt)}
        alt={template.name}
      />
      {artImageUrl && (
        <div className="preview-art-box" style={boxStyle(template.artPlacement, template)}>
          <img className="preview-art" src={artImageUrl} alt="Generated art" />
        </div>
      )}
      {template.textOverlays.map((o) => (
        <div
          key={o.id}
          className="preview-text"
          style={{
            ...boxStyle(o, template),
            color: o.color,
            fontSize: fontSizeCqw(o.fontSize, template.width),
            justifyContent: ALIGN_TO_JUSTIFY[o.align]
          }}
        >
          {textValues[o.id] ?? ''}
        </div>
      ))}
    </div>
  );
}
