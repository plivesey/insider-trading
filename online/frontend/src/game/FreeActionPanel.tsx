import { useMemo, useState } from 'react';
import type { Color, GoalCard, HandCard, ProjectedGameState, StockCard } from '@insider-trading/shared';
import { api } from '../lib/api.js';
import { showError } from '../lib/toast.js';

const COLORS: Color[] = ['Blue', 'Orange', 'Yellow', 'Purple'];

interface Props {
  state: ProjectedGameState;
}

/**
 * Try to build the unique stock-assignment for this goal from the player's
 * hand. Returns the assignment plus a flag indicating whether the player has
 * any meaningful choice in how to satisfy it.
 *
 * "Unambiguous" means: for each required color the player owns *exactly* the
 * needed count of that color (no surplus to choose from), and Wild Shares are
 * either unused or used in full. In all other cases the player should pick.
 */
function buildCanonicalAssignment(
  hand: HandCard[],
  requirements: Partial<Record<Color, number>>
): { assignment: Record<string, Color>; unambiguous: boolean } | null {
  const stocks = hand.filter((c): c is StockCard => c.category === 'stock');
  const wilds = stocks.filter(c => c.color === 'Wild');
  const byColor: Partial<Record<Color, StockCard[]>> = {};
  for (const c of stocks) {
    if (c.color === 'Wild') continue;
    const arr = byColor[c.color] ?? [];
    arr.push(c);
    byColor[c.color] = arr;
  }
  let ambiguous = false;
  const assignment: Record<string, Color> = {};
  let wildsUsed = 0;
  for (const color of COLORS) {
    const need = requirements[color] ?? 0;
    if (need <= 0) continue;
    const available = byColor[color] ?? [];
    if (available.length >= need) {
      // Take the first `need` of that color. If there are extras, the player
      // could plausibly choose differently (e.g. keep an Informant), so this
      // is ambiguous.
      if (available.length > need) ambiguous = true;
      for (let i = 0; i < need; i++) assignment[available[i].uid] = color;
    } else {
      // Use what we have of this color, fill the rest with Wilds.
      for (const c of available) assignment[c.uid] = color;
      const gap = need - available.length;
      if (wilds.length - wildsUsed < gap) return null; // can't satisfy
      for (let i = 0; i < gap; i++) {
        assignment[wilds[wildsUsed + i].uid] = color;
      }
      wildsUsed += gap;
    }
  }
  // Wild substitution: ambiguous unless we used all of them (no leftover wilds
  // means the player had no choice in which to spend).
  if (wildsUsed > 0 && wildsUsed < wilds.length) ambiguous = true;
  return { assignment, unambiguous: !ambiguous };
}

export function FreeActionPanel({ state }: Props) {
  const my = state.myPlayer;
  const [showClaim, setShowClaim] = useState<GoalCard | null>(null);
  const [assignment, setAssignment] = useState<Record<string, Color>>({});

  // Recompute the canonical assignment whenever the goal or hand changes.
  const canonical = useMemo(() => {
    if (!showClaim || !my) return null;
    return buildCanonicalAssignment(my.hand, showClaim.goal.parsed.requirements);
  }, [showClaim, my]);

  if (!my) return null;

  async function useHotTip() {
    try {
      await api.freeAction({ request: { kind: 'use_hot_tip' } });
    } catch (e) {
      showError((e as Error).message);
    }
  }

  async function submitClaim(payload?: Record<string, Color>) {
    if (!showClaim) return;
    try {
      await api.freeAction({
        request: {
          kind: 'claim_goal',
          goalUid: showClaim.uid,
          stockAssignment: { cards: payload ?? assignment }
        }
      });
      setShowClaim(null);
      setAssignment({});
    } catch (e) {
      showError((e as Error).message);
    }
  }

  return (
    <div className="panel">
      <h3>Free Actions</h3>
      {my.hotTipAvailable && <button onClick={useHotTip}>Use Hot Tip</button>}
      <div style={{ marginTop: 6 }}>
        <strong>Claim a goal:</strong>{' '}
        <select
          onChange={e => {
            const g = state.activeGoals.find(g => g.uid === e.target.value) ?? null;
            setShowClaim(g);
            setAssignment({});
          }}
          value={showClaim?.uid ?? ''}
        >
          <option value="">--</option>
          {state.activeGoals.map(g => (
            <option key={g.uid} value={g.uid}>{g.goal.text} → {g.reward.text}</option>
          ))}
        </select>
      </div>
      {showClaim && canonical === null && (
        <div style={{ marginTop: 6, padding: 6, background: '#222', color: '#f88' }}>
          You don't have enough stocks to satisfy this goal.
          <div style={{ marginTop: 6 }}>
            <button onClick={() => { setShowClaim(null); setAssignment({}); }}>Cancel</button>
          </div>
        </div>
      )}
      {showClaim && canonical && canonical.unambiguous && (
        <div style={{ marginTop: 6, padding: 6, background: '#222' }}>
          <div>One way to claim this goal — ready to submit.</div>
          <div style={{ marginTop: 6 }}>
            <button onClick={() => submitClaim(canonical.assignment)}>Claim</button>
            <button onClick={() => { setShowClaim(null); setAssignment({}); }}>Cancel</button>
          </div>
        </div>
      )}
      {showClaim && canonical && !canonical.unambiguous && (
        <div style={{ marginTop: 6, padding: 6, background: '#222' }}>
          <div>Assign each stock to a color (Wild Shares can substitute, leave others as <code>--</code> to skip):</div>
          {my.hand
            .filter(c => c.category === 'stock')
            .map(c => (
              <div key={c.uid} style={{ marginTop: 4 }}>
                <code>{(c as any).color}</code>{(c as any).name ? ` ${(c as any).name}` : ''} →{' '}
                <select
                  value={assignment[c.uid] ?? ''}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === '') {
                      // Un-assign: drop the key so the server doesn't see ''.
                      const { [c.uid]: _, ...rest } = assignment;
                      setAssignment(rest);
                    } else {
                      setAssignment({ ...assignment, [c.uid]: v as Color });
                    }
                  }}
                >
                  <option value="">--</option>
                  {COLORS.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
              </div>
            ))}
          <div style={{ marginTop: 6 }}>
            <button onClick={() => submitClaim()}>Submit claim</button>
            <button onClick={() => { setShowClaim(null); setAssignment({}); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
