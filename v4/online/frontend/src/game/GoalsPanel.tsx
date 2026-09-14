import { useState } from 'react';
import type { GoalCard, ProjectedGameState } from '@insider-trading/shared';
import { Panel, relabelColors } from './theme.js';
import { ClaimGoalModal } from './ClaimGoalModal.js';

interface Props {
  state: ProjectedGameState;
  goals: GoalCard[];
  canClaim: boolean;
}

export function GoalsPanel({ state, goals, canClaim }: Props) {
  const [claimUid, setClaimUid] = useState<string | null>(null);
  return (
    <Panel title="Active Goals">
      <div className="goals-strip">
        {goals.map(g => (
          <GoalTile
            key={g.uid}
            goal={g}
            onClick={canClaim ? () => setClaimUid(g.uid) : undefined}
          />
        ))}
      </div>
      {claimUid && (
        <ClaimGoalModal
          state={state}
          initialGoalUid={claimUid}
          onClose={() => setClaimUid(null)}
        />
      )}
    </Panel>
  );
}

function GoalTile({ goal, onClick }: { goal: GoalCard; onClick?: () => void }) {
  const interactive = !!onClick;
  return (
    <div
      className={`goal-tile${interactive ? ' goal-tile--clickable' : ''}`}
      onClick={onClick}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : -1}
      title={interactive ? 'Claim this goal' : undefined}
    >
      <div className="goal-tile__text">{relabelColors(goal.goal.text)}</div>
      <div className="goal-tile__reward">{relabelColors(goal.reward.text)}</div>
    </div>
  );
}
