import type { InsiderTipCard } from '@insider-trading/shared';
import { relabelColors } from './theme.js';

interface Props {
  tips: InsiderTipCard[];
  /** Cards remaining in the event deck (market-movement + goal cards combined). */
  eventDeckSize: number;
}

export function RecentTip({ tips, eventDeckSize }: Props) {
  if (tips.length === 0) {
    return (
      <div className="recent-tip">
        <div className="recent-tip__label">Market Movement</div>
        <div className="recent-tip__body">
          No market-movement card has resolved yet.{' '}
          <span className="recent-tip__when">event deck: {eventDeckSize} left</span>
        </div>
      </div>
    );
  }
  const tip = tips[tips.length - 1];
  return (
    <div className="recent-tip">
      <div className="recent-tip__label">Market Movement</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="recent-tip__head">{tipHeadline(tip)}</div>
        <div className="recent-tip__body">
          {relabelColors(tip.text)} ·{' '}
          <span className="recent-tip__when">most recent · event deck: {eventDeckSize} left</span>
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
