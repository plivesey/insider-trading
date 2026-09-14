import { useMemo, useState } from 'react';
import type { Color, GoalCard, ProjectedGameState, StockCard } from '@insider-trading/shared';
import { api } from '../lib/api.js';
import { showError } from '../lib/toast.js';
import { buildCanonicalAssignment } from './claim.js';
import { BrassButton, C, DecoCorner, INDUSTRY, INDUSTRY_ORDER, relabelColors } from './theme.js';

interface Props {
  state: ProjectedGameState;
  onClose: () => void;
  initialGoalUid?: string | null;
}

export function ClaimGoalModal({ state, onClose, initialGoalUid = null }: Props) {
  const my = state.myPlayer;
  const initial = initialGoalUid
    ? state.activeGoals.find(g => g.uid === initialGoalUid) ?? null
    : null;
  const [selected, setSelected] = useState<GoalCard | null>(initial);
  const [assignment, setAssignment] = useState<Record<string, Color>>({});

  const canonical = useMemo(() => {
    if (!selected || !my) return null;
    return buildCanonicalAssignment(my.hand, selected.goal.parsed.requirements);
  }, [selected, my]);

  async function submit(payload?: Record<string, Color>) {
    if (!selected) return;
    try {
      await api.freeAction({
        request: {
          kind: 'claim_goal',
          goalUid: selected.uid,
          stockAssignment: { cards: payload ?? assignment }
        }
      });
      onClose();
    } catch (e) {
      showError((e as Error).message);
    }
  }

  function selectGoal(g: GoalCard) {
    setSelected(g);
    setAssignment({});
  }

  if (!my) {
    return (
      <>
        <div className="deco-overlay" onClick={onClose} />
        <div className="deco-modal">
          <h3 className="deco-modal__title">Claim a Goal</h3>
          <div className="deco-modal__body">You aren't a player in this game.</div>
          <div className="deco-modal__footer">
            <BrassButton label="Close" onClick={onClose} />
          </div>
        </div>
      </>
    );
  }

  const handStocks = my.hand.filter((c): c is StockCard => c.category === 'stock');

  return (
    <>
      <div className="deco-overlay" onClick={onClose} />
      <div className="deco-modal" style={{ minWidth: 480, maxWidth: 680 }}>
        <div className="deco-modal__deco deco-modal__deco--tl"><DecoCorner size={18} color={C.brass} /></div>
        <div className="deco-modal__deco deco-modal__deco--tr"><DecoCorner size={18} color={C.brass} rotate={90} /></div>
        <div className="deco-modal__deco deco-modal__deco--bl"><DecoCorner size={18} color={C.brass} rotate={270} /></div>
        <div className="deco-modal__deco deco-modal__deco--br"><DecoCorner size={18} color={C.brass} rotate={180} /></div>
        <h3 className="deco-modal__title">Claim a Goal</h3>
        <div className="deco-modal__body">
          <div className="claim-goal-list">
            {state.activeGoals.map(g => (
              <div
                key={g.uid}
                className={`goal-tile${selected?.uid === g.uid ? ' is-selected' : ''}`}
                onClick={() => selectGoal(g)}
              >
                <div className="goal-tile__text">{relabelColors(g.goal.text)}</div>
                <div className="goal-tile__reward">{relabelColors(g.reward.text)}</div>
              </div>
            ))}
          </div>

          {selected && canonical === null && (
            <div className="deco-modal__notice">
              You don't have enough stocks to satisfy this goal.
            </div>
          )}

          {selected && canonical && canonical.unambiguous && (
            <div className="deco-modal__success">
              One way to claim this goal — ready to submit. Reward: <em>{relabelColors(selected.reward.text)}</em>.
            </div>
          )}

          {selected && canonical && !canonical.unambiguous && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: C.ivory2, marginBottom: 6 }}>
                Assign each stock to an industry (Wild Shares can substitute; leave others as <code>--</code>):
              </div>
              {handStocks.map(c => (
                <div key={c.uid} className="claim-assignment-row">
                  <span className="claim-assignment-row__card">
                    {INDUSTRY[c.color].label}{c.name ? ` ${c.name}` : ''}
                  </span>
                  <select
                    className="deco-select"
                    value={assignment[c.uid] ?? ''}
                    onChange={e => {
                      const v = e.target.value;
                      if (v === '') {
                        const { [c.uid]: _drop, ...rest } = assignment;
                        setAssignment(rest);
                      } else {
                        setAssignment({ ...assignment, [c.uid]: v as Color });
                      }
                    }}
                  >
                    <option value="">--</option>
                    {INDUSTRY_ORDER.map(col => (
                      <option key={col} value={col}>{INDUSTRY[col].label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="deco-modal__footer">
          {selected && canonical && canonical.unambiguous && (
            <BrassButton label="Claim" primary onClick={() => submit(canonical.assignment)} />
          )}
          {selected && canonical && !canonical.unambiguous && (
            <BrassButton label="Submit claim" primary onClick={() => submit()} />
          )}
          <BrassButton label={selected ? 'Cancel' : 'Close'} onClick={onClose} />
        </div>
      </div>
    </>
  );
}
