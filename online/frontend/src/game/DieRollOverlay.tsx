import { useEffect, useRef, useState } from 'react';
import type { GameLogEntry } from '@insider-trading/shared';
import { C, DecoCorner, relabelColors } from './theme.js';

interface Props {
  log: GameLogEntry[];
}

type Face = 'bull' | 'bear' | 'nothing' | 'draw1' | 'draw2' | 'draw3';

const FACE_GLYPH: Record<Face, string> = {
  bull: '▲',
  bear: '▼',
  nothing: '—',
  draw1: '1',
  draw2: '2',
  draw3: '3'
};

const FACE_LABEL: Record<Face, string> = {
  bull: 'Bull Market',
  bear: 'Bear Market',
  nothing: 'Nothing',
  draw1: 'Draw 1 Event',
  draw2: 'Draw 2 Events',
  draw3: 'Draw 3 Events'
};

interface DrawnCardInfo {
  kind: 'market_movement' | 'goal';
  text: string;
}

type Animation =
  | { phase: 'die'; dieId: string; face: Face; resultText: string | null; drawnCards: DrawnCardInfo[]; key: number }
  | { phase: 'card'; index: number; drawnCards: DrawnCardInfo[]; key: number }
  | null;

const DRAW_COUNTS: Partial<Record<Face, number>> = { draw1: 1, draw2: 2, draw3: 3 };

/**
 * Watches the game log for `die_roll` events (the dice-bag draw) and shows a
 * brief overlay naming the die and its face. For a Draw N face, follows up
 * with a short sequential reveal of each card resolved from the event deck.
 */
export function DieRollOverlay({ log }: Props) {
  const [anim, setAnim] = useState<Animation>(null);
  const lastSeqRef = useRef<number>(-1);

  useEffect(() => {
    if (log.length === 0) {
      lastSeqRef.current = -1;
      return;
    }
    let dieEntry: GameLogEntry | null = null;
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (e.seq <= lastSeqRef.current) break;
      if (e.type === 'die_roll') {
        dieEntry = e;
        break;
      }
    }
    if (!dieEntry) {
      lastSeqRef.current = Math.max(lastSeqRef.current, log[log.length - 1].seq);
      return;
    }
    const dieId = (dieEntry.payload?.die as string) ?? '?';
    const face = ((dieEntry.payload?.face as Face) ?? 'nothing') as Face;
    const dieIdx = log.indexOf(dieEntry);
    let resultText: string | null = null;
    for (let i = dieIdx - 1; i >= 0; i--) {
      const e = log[i];
      if (e.type === 'die_roll') break;
      if (e.type === 'auction_resolved' || e.type === 'sell_stock') {
        resultText = relabelColors(e.message);
        break;
      }
    }
    const wantCards = DRAW_COUNTS[face] ?? 0;
    const drawnCards: DrawnCardInfo[] = [];
    if (wantCards > 0) {
      for (let i = dieIdx + 1; i < log.length && drawnCards.length < wantCards; i++) {
        const e = log[i];
        if (e.type === 'die_roll') break;
        if (e.type === 'market_movement_resolved') {
          const text = (e.payload?.text as string) ?? e.message;
          drawnCards.push({ kind: 'market_movement', text: relabelColors(text) });
        } else if (e.type === 'goal_revealed') {
          const goalText = (e.payload?.goalText as string) ?? '';
          const rewardText = (e.payload?.rewardText as string) ?? '';
          drawnCards.push({ kind: 'goal', text: relabelColors(`${goalText} → ${rewardText}`) });
        }
      }
    }
    lastSeqRef.current = dieEntry.seq;
    setAnim({ phase: 'die', dieId, face, resultText, drawnCards, key: dieEntry.seq });
  }, [log]);

  useEffect(() => {
    if (!anim) return;
    if (anim.phase === 'die') {
      const t = setTimeout(() => {
        if (anim.drawnCards.length > 0) {
          setAnim({ phase: 'card', index: 0, drawnCards: anim.drawnCards, key: anim.key });
        } else {
          setAnim(null);
        }
      }, 2600);
      return () => clearTimeout(t);
    }
    if (anim.phase === 'card') {
      const t = setTimeout(() => {
        if (anim.index + 1 < anim.drawnCards.length) {
          setAnim({ phase: 'card', index: anim.index + 1, drawnCards: anim.drawnCards, key: anim.key });
        } else {
          setAnim(null);
        }
      }, 2800);
      return () => clearTimeout(t);
    }
  }, [anim]);

  if (!anim) return null;

  if (anim.phase === 'die') {
    return (
      <div className="die-overlay" key={anim.key}>
        {anim.resultText && <div className="die-result">{anim.resultText}</div>}
        <div className={`die-face die-face--${anim.face}`}>{FACE_GLYPH[anim.face]}</div>
        <div className="die-label">Die {anim.dieId} · {FACE_LABEL[anim.face]}</div>
      </div>
    );
  }

  const card = anim.drawnCards[anim.index];
  return (
    <div className="die-overlay" key={`${anim.key}-card-${anim.index}`}>
      <div className="tip-banner">
        {card.kind === 'goal' ? 'Goal Revealed' : 'Market Movement'}
        {anim.drawnCards.length > 1 ? ` (${anim.index + 1}/${anim.drawnCards.length})` : ''}
      </div>
      <div className="tip-text">
        <div style={{ position: 'absolute', top: 6, left: 8, opacity: 0.6 }}>
          <DecoCorner size={16} color={C.brass} />
        </div>
        <div style={{ position: 'absolute', top: 6, right: 8, opacity: 0.6 }}>
          <DecoCorner size={16} color={C.brass} rotate={90} />
        </div>
        <div style={{ position: 'absolute', bottom: 6, left: 8, opacity: 0.6 }}>
          <DecoCorner size={16} color={C.brass} rotate={270} />
        </div>
        <div style={{ position: 'absolute', bottom: 6, right: 8, opacity: 0.6 }}>
          <DecoCorner size={16} color={C.brass} rotate={180} />
        </div>
        {card.text}
      </div>
    </div>
  );
}
