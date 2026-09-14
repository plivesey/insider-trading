import type { CSSProperties } from 'react';
import type { Box } from './types.js';

// Resolution-independent placement, ported from cards/print-cards.js: a box
// authored in the template's native pixel space, expressed as percentages of
// its parent so it lands identically at any render size with no JS resize
// math. Requires the parent to be `position: relative` sized to the
// template's aspect ratio.
export function boxStyle(box: Box, canvas: { width: number; height: number }): CSSProperties {
  return {
    position: 'absolute',
    left: `${(box.x / canvas.width) * 100}%`,
    top: `${(box.y / canvas.height) * 100}%`,
    width: `${(box.w / canvas.width) * 100}%`,
    height: `${(box.h / canvas.height) * 100}%`
  };
}

// Font size as a fraction of the template's width, expressed in container
// query width units (cqw) so it scales with the rendered box's actual pixel
// width. Requires an ancestor with `container-type: inline-size`.
export function fontSizeCqw(fontSizePx: number, canvasWidth: number): string {
  return `${(fontSizePx / canvasWidth) * 100}cqw`;
}
