import { useEffect, useRef, useState } from 'react';
import type { GameLogEntry } from '@insider-trading/shared';

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
 * die fades. Stays out of the way otherwise.
 */
export function DieRollOverlay({ log }: Props) {
  const [anim, setAnim] = useState<Animation>(null);
  // Track the highest seq we've already animated so we don't re-trigger when
  // the log array is replaced (e.g. reconnect).
  const lastSeqRef = useRef<number>(-1);

  useEffect(() => {
    if (log.length === 0) {
      lastSeqRef.current = -1;
      return;
    }
    // Find the most recent die_roll event we haven't animated yet.
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
      // Still bump the cursor so we don't keep scanning old entries.
      lastSeqRef.current = Math.max(lastSeqRef.current, log[log.length - 1].seq);
      return;
    }
    const die = (dieEntry.payload?.die as number) ?? 0;
    const dieIdx = log.indexOf(dieEntry);
    // Scan back within the same turn for the turn action's result so we can
    // caption the roll (e.g. "Alice wins Orange Informant at $5"). Stops at
    // the previous turn's die_roll.
    let resultText: string | null = null;
    for (let i = dieIdx - 1; i >= 0; i--) {
      const e = log[i];
      if (e.type === 'die_roll') break;
      if (e.type === 'auction_resolved' || e.type === 'sell_stock') {
        resultText = e.message;
        break;
      }
    }
    // If die=1, find the insider_tip_resolved event that immediately follows.
    let tipText: string | null = null;
    if (die === 1) {
      for (let i = dieIdx + 1; i < log.length; i++) {
        if (log[i].type === 'insider_tip_resolved') {
          tipText = (log[i].payload?.text as string) ?? log[i].message.replace(/^Insider Tip flipped:\s*/, '');
          break;
        }
        // Stop scanning at the next die_roll — tip belongs to this die or
        // didn't fire.
        if (log[i].type === 'die_roll') break;
      }
    }
    lastSeqRef.current = dieEntry.seq;
    setAnim({ phase: 'die', die, tipText, resultText, key: dieEntry.seq });
  }, [log]);

  // Drive the phase transitions via timers.
  useEffect(() => {
    if (!anim) return;
    if (anim.phase === 'die') {
      const dieMs = 2100;
      const t = setTimeout(() => {
        if (anim.tipText) {
          setAnim({ phase: 'tip', die: anim.die, tipText: anim.tipText, key: anim.key });
        } else {
          setAnim(null);
        }
      }, dieMs);
      return () => clearTimeout(t);
    }
    if (anim.phase === 'tip') {
      const tipMs = 2200;
      const t = setTimeout(() => setAnim(null), tipMs);
      return () => clearTimeout(t);
    }
  }, [anim]);

  if (!anim) return null;
  if (anim.phase === 'die') {
    return (
      <div className="die-overlay" key={anim.key}>
        {anim.resultText && <div className="die-result">{anim.resultText}</div>}
        <div className="die-face">{DIE_FACES[anim.die] ?? '?'}</div>
        <div className="die-label">Die rolled: {anim.die}</div>
      </div>
    );
  }
  // Tip phase.
  return (
    <div className="die-overlay" key={`${anim.key}-tip`}>
      <div className="tip-banner">Insider Tip</div>
      <div className="tip-text">{anim.tipText}</div>
    </div>
  );
}
