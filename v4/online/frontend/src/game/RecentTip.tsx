import type { InsiderTipCard } from '@insider-trading/shared';
import { relabelColors } from './theme.js';

interface Props {
  tips: InsiderTipCard[];
  deckSize: number;
}

export function RecentTip({ tips, deckSize }: Props) {
  if (tips.length === 0) {
    return (
      <div className="recent-tip">
        <div className="recent-tip__label">Insider Tip</div>
        <div className="recent-tip__body">
          No tip has been flipped yet. <span className="recent-tip__when">deck has {deckSize} left</span>
        </div>
      </div>
    );
  }
  const tip = tips[tips.length - 1];
  return (
    <div className="recent-tip">
      <div className="recent-tip__label">Insider Tip</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="recent-tip__head">{tipHeadline(tip)}</div>
        <div className="recent-tip__body">
          {relabelColors(tip.text)} · <span className="recent-tip__when">most recent</span>
        </div>
      </div>
    </div>
  );
}

function tipHeadline(tip: InsiderTipCard): string {
  if (tip.effect.type === 'halve') return 'CRASH';
  if (tip.effect.type === 'adjust') {
    const entries = Object.entries(tip.effect.changes);
    const positives = entries.filter(([, v]) => (v as number) > 0).length;
    const negatives = entries.filter(([, v]) => (v as number) < 0).length;
    if (positives > 0 && negatives === 0) return 'SURGE';
    if (negatives > 0 && positives === 0) return 'SLUMP';
  }
  return tip.type.toUpperCase();
}
