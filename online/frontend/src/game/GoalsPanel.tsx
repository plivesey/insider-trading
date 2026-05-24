import type { GoalCard } from '@insider-trading/shared';

interface Props {
  goals: GoalCard[];
}

export function GoalsPanel({ goals }: Props) {
  return (
    <div className="section">
      <h3>Active Goals</h3>
      <div className="card-row">
        {goals.map(g => (
          <div key={g.uid} className="goal-card">
            <div className="req">{g.goal.text}</div>
            <div className="rew">→ {g.reward.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
