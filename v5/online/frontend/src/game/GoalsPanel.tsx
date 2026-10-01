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
  const [claim, setClaim] = useState<{ source: 'row' | 'hand'; goalUid: string } | null>(null);
  const privateGoals = (state.myPlayer?.hand.filter((c): c is GoalCard => c.category === 'goal')) ?? [];

  return (
    <Panel title="Active Goals">
      <div className="goals-strip">
        {goals.map(g => (
          <GoalTile
            key={g.uid}
            goal={g}
            onClick={canClaim ? () => setClaim({ source: 'row', goalUid: g.uid }) : undefined}
          />
        ))}
      </div>
      {privateGoals.length > 0 && (
        <>
          <div className="goals-strip__private-label">My Private Goals</div>
          <div className="goals-strip goals-strip--private">
            {privateGoals.map(g => (
              <GoalTile
                key={g.uid}
                goal={g}
                isPrivate
                onClick={canClaim ? () => setClaim({ source: 'hand', goalUid: g.uid }) : undefined}
              />
            ))}
          </div>
        </>
      )}
      {claim && (
        <ClaimGoalModal
          state={state}
          source={claim.source}
          initialGoalUid={claim.goalUid}
          onClose={() => setClaim(null)}
        />
      )}
    </Panel>
  );
}

function GoalTile({ goal, onClick, isPrivate = false }: { goal: GoalCard; onClick?: () => void; isPrivate?: boolean }) {
  const interactive = !!onClick;
  return (
    <div
      className={`goal-tile${interactive ? ' goal-tile--clickable' : ''}${isPrivate ? ' goal-tile--private' : ''}`}
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
