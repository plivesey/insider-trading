import { useEffect, useRef, useState } from 'react';
import type { GameLogEntry } from '@insider-trading/shared';
import { C, DecoCorner, relabelColors } from './theme.js';

interface Props {
  log: GameLogEntry[];
}

const DIE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

type Animation =
  | { phase: 'die'; die: number; tipText: string | null; resultText: string | null; key: number }
  | { phase: 'tip'; die: number; tipText: string; key: number }
  | null;

/**
 * Watches the game log for `die_roll` events and shows a brief overlay with
 * the die face. If die=1 also reveals the resolved Insider Tip text after the
 * die fades.
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
    const die = (dieEntry.payload?.die as number) ?? 0;
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
    let tipText: string | null = null;
    if (die === 1) {
      for (let i = dieIdx + 1; i < log.length; i++) {
        if (log[i].type === 'insider_tip_resolved') {
          const raw =
            (log[i].payload?.text as string) ??
            log[i].message.replace(/^Insider Tip flipped:\s*/, '');
          tipText = relabelColors(raw);
          break;
        }
        if (log[i].type === 'die_roll') break;
      }
    }
    lastSeqRef.current = dieEntry.seq;
    setAnim({ phase: 'die', die, tipText, resultText, key: dieEntry.seq });
  }, [log]);

  useEffect(() => {
    if (!anim) return;
    if (anim.phase === 'die') {
      const t = setTimeout(() => {
        if (anim.tipText) {
          setAnim({ phase: 'tip', die: anim.die, tipText: anim.tipText, key: anim.key });
        } else {
          setAnim(null);
        }
      }, 3100);
      return () => clearTimeout(t);
    }
    if (anim.phase === 'tip') {
      const t = setTimeout(() => setAnim(null), 3400);
      return () => clearTimeout(t);
    }
  }, [anim]);

  if (!anim) return null;
  if (anim.phase === 'die') {
    return (
      <div className="die-overlay" key={anim.key}>
        {anim.resultText && <div className="die-result">{anim.resultText}</div>}
        <div className="die-face">{DIE_FACES[anim.die] ?? '?'}</div>
        <div className="die-label">Die rolled · {anim.die}</div>
      </div>
    );
  }
  return (
    <div className="die-overlay" key={`${anim.key}-tip`}>
      <div className="tip-banner">Insider Tip</div>
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
        {anim.tipText}
      </div>
    </div>
  );
}
