import type { PlayerPublic, PlayerPrivate } from '@insider-trading/shared';

interface Props {
  players: PlayerPublic[];
  currentPlayerIndex: number;
  myPlayer: PlayerPrivate | null;
}

export function PlayersPanel({ players, currentPlayerIndex, myPlayer }: Props) {
  return (
    <div className="section">
      <h3>Players</h3>
      <div className="players-grid">
        {players.map((p, idx) => {
          const isCurrent = idx === currentPlayerIndex;
          const isMe = myPlayer?.playerId === p.playerId;
          return (
            <div
              key={p.playerId}
              className={`player-card${isCurrent ? ' current' : ''}${isMe ? ' me' : ''}`}
            >
              <div className="name">
                {p.name} {isCurrent ? '←' : ''}
              </div>
              <div className="stats">
                ${p.cash} cash · {p.handSize} cards · {p.loans} loans · {p.goalsClaimed.length} goals
              </div>
              {p.persistentEffects.length > 0 && (
                <div className="stats">★ {p.persistentEffects.map(e => e.name).join(', ')}</div>
              )}
              {!p.connected && <div className="stats">(offline)</div>}
              {p.hotTipAvailable && <div className="stats">Hot Tip available</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
