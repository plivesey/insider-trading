import { useEffect, useRef, useState } from 'react';
import type { GameLogEntry, PlayerId } from '@insider-trading/shared';
import { C, DecoCorner, relabelColors } from './theme.js';

interface Props {
  log: GameLogEntry[];
  myPlayerId?: PlayerId;
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
  /** 'market_movement' = dice-drawn (no actor); the other two always have one. */
  kind: 'market_movement' | 'market_movement_played' | 'goal_claimed';
  text: string;
}

type Animation =
  | { phase: 'die'; dieId: string; face: Face; resultText: string | null; drawnCards: DrawnCardInfo[]; key: number }
  | { phase: 'card'; index: number; drawnCards: DrawnCardInfo[]; key: number }
  | null;

const DRAW_COUNTS: Partial<Record<Face, number>> = { draw1: 1, draw2: 2, draw3: 3 };
const TRIGGER_TYPES = new Set(['die_roll', 'market_movement_played', 'goal_claimed', 'private_goal_claimed']);

const HEADER_LABEL: Record<DrawnCardInfo['kind'], string> = {
  market_movement: 'Market Movement',
  market_movement_played: 'Market Movement Played',
  goal_claimed: 'Goal Claimed'
};

/**
 * Watches the game log for the events that reveal a market-movement or goal
 * card and shows a brief overlay for each:
 *  - `die_roll` (the dice-bag draw) -- shows the die animation, then for a
 *    Draw N face, a sequential reveal of each card resolved right after it.
 *    Goals are never drawn mid-game in V6 (see domain/setup.ts), so this
 *    path only ever surfaces market-movement cards.
 *  - `market_movement_played` -- a player played a held tip card as a free
 *    action; skips straight to the card reveal (no die involved), paired
 *    with the `market_movement_resolved` entry right after it for the
 *    card's actual text.
 *  - `goal_claimed` / `private_goal_claimed` -- a player claimed a goal
 *    (public or private); skips straight to the card reveal, using the
 *    event's own message (already names the player, goal, and reward).
 *    Suppressed for the claimer themselves (`myPlayerId`) -- they already
 *    know they just claimed it; everyone else still sees it.
 */
export function DieRollOverlay({ log, myPlayerId }: Props) {
  const [anim, setAnim] = useState<Animation>(null);
  const lastSeqRef = useRef<number>(-1);

  useEffect(() => {
    if (log.length === 0) {
      lastSeqRef.current = -1;
      return;
    }
    let triggerEntry: GameLogEntry | null = null;
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (e.seq <= lastSeqRef.current) break;
      if (TRIGGER_TYPES.has(e.type)) {
        triggerEntry = e;
        break;
      }
    }
    if (!triggerEntry) {
      lastSeqRef.current = Math.max(lastSeqRef.current, log[log.length - 1].seq);
      return;
    }
    lastSeqRef.current = triggerEntry.seq;

    if (triggerEntry.type === 'goal_claimed' || triggerEntry.type === 'private_goal_claimed') {
      if (myPlayerId && triggerEntry.actor === myPlayerId) return;
      const drawnCards: DrawnCardInfo[] = [{ kind: 'goal_claimed', text: relabelColors(triggerEntry.message) }];
      setAnim({ phase: 'card', index: 0, drawnCards, key: triggerEntry.seq });
      return;
    }

    if (triggerEntry.type === 'market_movement_played') {
      const idx = log.indexOf(triggerEntry);
      const resolved = log.slice(idx + 1).find(e => e.type === 'market_movement_resolved');
      const text = resolved ? ((resolved.payload?.text as string) ?? resolved.message) : triggerEntry.message;
      const drawnCards: DrawnCardInfo[] = [{ kind: 'market_movement_played', text: relabelColors(text) }];
      setAnim({ phase: 'card', index: 0, drawnCards, key: triggerEntry.seq });
      return;
    }

    // die_roll: existing dice-bag flow.
    const dieEntry = triggerEntry;
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
        }
      }
    }
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
      }, 5600); // doubled from 2800: longer on-screen time for revealed cards
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
        {HEADER_LABEL[card.kind]}
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
