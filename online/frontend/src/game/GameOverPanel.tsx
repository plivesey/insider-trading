import { useState } from 'react';
import type { Color, GameOver, GameVariant, HandCard, PlayerId, PlayerPublic, ProjectedGameState } from '@insider-trading/shared';
import { api } from '../lib/api.js';
import { BrassButton } from './theme.js';
import { CardTile } from './CardTile.js';
import { Ticker } from './Ticker.js';

const ZERO_DELTA: Record<Color, number> = { Blue: 0, Orange: 0, Green: 0, Purple: 0 };

interface Props {
  gameOver: GameOver;
  state: ProjectedGameState;
}

export function GameOverPanel({ gameOver, state }: Props) {
  const winners = new Set(gameOver.winnerPlayerIds);
  const myId = state.myPlayer?.playerId ?? null;
  const [openId, setOpenId] = useState<PlayerId | null>(myId);
  const revealed = state.revealedHands ?? {};
  const playerById: Record<PlayerId, PlayerPublic> = Object.fromEntries(
    state.players.map(p => [p.playerId, p])
  );

  return (
    <div className="deco-panel">
      <div className="game-over">
        <h2 className="game-over__title">Game Over</h2>
        <div className="game-over__reason">
          End condition: <b>{gameOver.reason.replace(/_/g, ' ')}</b>
        </div>
        <table className="game-over__table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Cash</th>
              <th>Stocks</th>
              <th>Bonus</th>
              <th>−Loans</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {gameOver.breakdown.sort((a, b) => b.total - a.total).map(b => {
              const isOpen = openId === b.playerId;
              return (
                <tr
                  key={b.playerId}
                  className={[
                    winners.has(b.playerId) ? 'winner' : '',
                    isOpen ? 'is-open' : '',
                    'game-over__row'
                  ].filter(Boolean).join(' ')}
                  onClick={() => setOpenId(isOpen ? null : b.playerId)}
                >
                  <td>
                    {b.name}
                    {winners.has(b.playerId) ? ' 🏆' : ''}
                    {b.playerId === myId ? ' (you)' : ''}
                  </td>
                  <td>${b.cash}</td>
                  <td>${b.stockValue}</td>
                  <td>${b.endGameBonus}</td>
                  <td>${b.loanPenalty}</td>
                  <td>${b.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="game-over__prices">
          <div className="game-over__section-title">Final Prices</div>
          <Ticker prices={state.stockPrices} delta5={ZERO_DELTA} hideDelta />
        </div>
        {openId && (
          <PlayerHandView
            player={playerById[openId]}
            hand={revealed[openId] ?? []}
            variant={state.variant}
          />
        )}
        <div style={{ marginTop: 22 }}>
          <BrassButton
            label="New Game · Return to Lobby"
            primary
            onClick={() => api.reset().then(() => location.reload())}
          />
        </div>
      </div>
    </div>
  );
}

function PlayerHandView({
  player,
  hand,
  variant
}: {
  player: PlayerPublic | undefined;
  hand: HandCard[];
  variant: GameVariant;
}) {
  if (!player) return null;
  return (
    <div className="game-over__hand">
      <div className="game-over__hand-head">
        <span className="game-over__hand-title">{player.name}'s hand</span>
        <span className="game-over__hand-sub">
          {hand.length === 0 ? 'empty' : `${hand.length} card${hand.length === 1 ? '' : 's'}`}
        </span>
      </div>
      {hand.length > 0 && (
        <div className="card-row">
          {hand.map(c => (
            <CardTile key={c.uid} card={c} variant={variant} />
          ))}
        </div>
      )}
      {player.goalsClaimed.length > 0 && (
        <div className="game-over__goals">
          <div className="game-over__hand-sub" style={{ marginBottom: 6 }}>
            Goals claimed:
          </div>
          <ul className="game-over__goals-list">
            {player.goalsClaimed.map(g => (
              <li key={g.uid}>{g.goal.text} <em>(reward: {g.reward.text})</em></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
