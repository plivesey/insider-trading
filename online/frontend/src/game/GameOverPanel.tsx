import type { GameOver } from '@insider-trading/shared';
import { api } from '../lib/api.js';

interface Props {
  gameOver: GameOver;
}

export function GameOverPanel({ gameOver }: Props) {
  const winners = new Set(gameOver.winnerPlayerIds);
  return (
    <div className="game-over">
      <h2>Game Over</h2>
      <div>End condition: <strong>{gameOver.reason.replace(/_/g, ' ')}</strong></div>
      <table>
        <thead>
          <tr><th>Player</th><th>Cash</th><th>Stocks</th><th>Bonus</th><th>−Loans</th><th>Total</th></tr>
        </thead>
        <tbody>
          {gameOver.breakdown.sort((a, b) => b.total - a.total).map(b => (
            <tr key={b.playerId} className={winners.has(b.playerId) ? 'winner' : ''}>
              <td>{b.name}{winners.has(b.playerId) ? ' 🏆' : ''}</td>
              <td>${b.cash}</td>
              <td>${b.stockValue}</td>
              <td>${b.endGameBonus}</td>
              <td>${b.loanPenalty}</td>
              <td>${b.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => api.reset().then(() => location.reload())} style={{ marginTop: '1rem', padding: '8px 16px' }}>
        New Game (return to lobby)
      </button>
    </div>
  );
}
