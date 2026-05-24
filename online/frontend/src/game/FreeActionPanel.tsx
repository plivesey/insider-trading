import { useState } from 'react';
import type { Color, GoalCard, ProjectedGameState } from '@insider-trading/shared';
import { api } from '../lib/api.js';
import { showError } from '../lib/toast.js';

const COLORS: Color[] = ['Blue', 'Orange', 'Yellow', 'Purple'];

interface Props {
  state: ProjectedGameState;
}

export function FreeActionPanel({ state }: Props) {
  const my = state.myPlayer;
  const [showClaim, setShowClaim] = useState<GoalCard | null>(null);
  const [assignment, setAssignment] = useState<Record<string, Color>>({});

  if (!my) return null;

  async function useHotTip() {
    try {
      await api.freeAction({ request: { kind: 'use_hot_tip' } });
    } catch (e) {
      showError((e as Error).message);
    }
  }

  async function submitClaim() {
    if (!showClaim) return;
    try {
      await api.freeAction({
        request: {
          kind: 'claim_goal',
          goalUid: showClaim.uid,
          stockAssignment: { cards: assignment }
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
      {showClaim && (
        <div style={{ marginTop: 6, padding: 6, background: '#222' }}>
          <div>Assign each stock to a color (Wild Shares can substitute):</div>
          {my.hand
            .filter(c => c.category === 'stock')
            .map(c => (
              <div key={c.uid} style={{ marginTop: 4 }}>
                <code>{(c as any).color}</code>{(c as any).name ? ` ${(c as any).name}` : ''} →{' '}
                <select
                  value={assignment[c.uid] ?? ''}
                  onChange={e => setAssignment({ ...assignment, [c.uid]: e.target.value as Color })}
                >
                  <option value="">--</option>
                  {COLORS.map(col => <option key={col} value={col}>{col}</option>)}
                  <option value="REMOVE">— remove —</option>
                </select>
              </div>
            ))}
          <div style={{ marginTop: 6 }}>
            <button onClick={submitClaim}>Submit claim</button>
            <button onClick={() => { setShowClaim(null); setAssignment({}); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
