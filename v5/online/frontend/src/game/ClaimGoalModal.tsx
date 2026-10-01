import { useMemo, useState } from 'react';
import type { GoalCard, ProjectedGameState } from '@insider-trading/shared';
import { api } from '../lib/api.js';
import { showError } from '../lib/toast.js';
import { buildCanonicalAssignment } from './claim.js';
import { BrassButton, C, DecoCorner, relabelColors } from './theme.js';

interface Props {
  state: ProjectedGameState;
  onClose: () => void;
  /** 'row' = claim a public goal from the goal row; 'hand' = reveal-and-claim a private goal from your own hand. */
  source: 'row' | 'hand';
  initialGoalUid?: string | null;
}

export function ClaimGoalModal({ state, onClose, source, initialGoalUid = null }: Props) {
  const my = state.myPlayer;
  const candidates: GoalCard[] =
    source === 'row'
      ? state.goalRow
      : (my?.hand.filter((c): c is GoalCard => c.category === 'goal') ?? []);
  const initial = initialGoalUid ? candidates.find(g => g.uid === initialGoalUid) ?? null : null;
  const [selected, setSelected] = useState<GoalCard | null>(initial);

  const canonical = useMemo(() => {
    if (!selected || !my) return null;
    return buildCanonicalAssignment(my.hand, selected.goal.parsed.requirements);
  }, [selected, my]);

  async function submit() {
    if (!selected || !canonical) return;
    try {
      await api.freeAction({
        request: {
          kind: source === 'row' ? 'claim_goal' : 'claim_private_goal',
          goalUid: selected.uid,
          stockAssignment: { cards: canonical.assignment }
        }
      });
      onClose();
    } catch (e) {
      showError((e as Error).message);
    }
  }

  function selectGoal(g: GoalCard) {
    setSelected(g);
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

  const title = source === 'row' ? 'Claim a Goal' : 'Reveal & Claim a Private Goal';

  return (
    <>
      <div className="deco-overlay" onClick={onClose} />
      <div className="deco-modal" style={{ minWidth: 480, maxWidth: 680 }}>
        <div className="deco-modal__deco deco-modal__deco--tl"><DecoCorner size={18} color={C.brass} /></div>
        <div className="deco-modal__deco deco-modal__deco--tr"><DecoCorner size={18} color={C.brass} rotate={90} /></div>
        <div className="deco-modal__deco deco-modal__deco--bl"><DecoCorner size={18} color={C.brass} rotate={270} /></div>
        <div className="deco-modal__deco deco-modal__deco--br"><DecoCorner size={18} color={C.brass} rotate={180} /></div>
        <h3 className="deco-modal__title">{title}</h3>
        <div className="deco-modal__body">
          {source === 'hand' && (
            <div className="deco-modal__notice">
              This goal is secret — only you know about it. Claiming it reveals it to the table.
            </div>
          )}
          <div className="claim-goal-list">
            {candidates.map(g => (
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

          {selected && canonical && canonical.wildsUsed === 0 && (
            <div className="deco-modal__success">
              Ready to claim — no Wild Shares needed. Reward: <em>{relabelColors(selected.reward.text)}</em>.
            </div>
          )}

          {selected && canonical && canonical.wildsUsed > 0 && (
            <div className="deco-modal__notice">
              Claiming this will spend {canonical.wildsUsed} Wild Share{canonical.wildsUsed === 1 ? '' : 's'} from your hand.
              Reward: <em>{relabelColors(selected.reward.text)}</em>. Still want to claim it now?
            </div>
          )}
        </div>
        <div className="deco-modal__footer">
          {selected && canonical && (
            <BrassButton label="Claim" primary onClick={submit} />
          )}
          <BrassButton label={selected ? 'Cancel' : 'Close'} onClick={onClose} />
        </div>
      </div>
    </>
  );
}
