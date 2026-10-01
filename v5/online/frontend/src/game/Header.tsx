import type { ProjectedGameState } from '@insider-trading/shared';
import { DecoBadge, ProgressSteps } from './theme.js';

interface Props {
  state: ProjectedGameState;
}

function Meta({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="gb-meta">
      <div className="gb-meta__label">{label}</div>
      <div className={`gb-meta__value${warn ? ' gb-meta__value--warn' : ''}`}>{value}</div>
    </div>
  );
}

export function Header({ state }: Props) {
  // The wire field counts UP (0 -> progressThreshold); the display counts
  // DOWN, reading like "moves left until the bubble bursts."
  const remaining = Math.max(0, state.progressThreshold - state.progressTracker);
  // The engine doesn't end the game the instant the threshold is hit -- it
  // lets the current turn (and any final goal claims) finish first, so the
  // dots can sit at zero for a bit before the game actually ends.
  const finalTurn = remaining === 0 && !state.gameOver;
  return (
    <div className="gb-header">
      <div className="gb-header__brand">
        <DecoBadge />
        <div>
          <div className="gb-header__title">INSIDER TRADING</div>
          <div className="gb-header__sub">EST. MCMXX · NEW YORK EXCHANGE</div>
        </div>
      </div>
      <div className="gb-header__spacer" />
      <Meta label="MARKET DECK" value={String(state.mainDeckSize)} />
      <div className="gb-divider" />
      <Meta label="DISCARD" value={String(state.discardPileSize)} />
      <div className="gb-divider" />
      <Meta label="EVENT DECK" value={String(state.eventDeckSize)} />
      <div className="gb-divider" />
      <div className="gb-meta">
        <div className={`gb-meta__label${finalTurn ? ' gb-meta__label--warn' : ''}`}>
          {finalTurn ? 'Final Turn — Ending Soon' : 'Until the Bubble Bursts'}
        </div>
        <ProgressSteps remaining={remaining} total={state.progressThreshold} />
      </div>
    </div>
  );
}
