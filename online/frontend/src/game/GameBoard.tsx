import type { GameLogEntry, ProjectedGameState } from '@insider-trading/shared';
import { COLORS } from '@insider-trading/shared';
import { MarketPanel } from './MarketPanel.js';
import { GoalsPanel } from './GoalsPanel.js';
import { PlayersPanel } from './PlayersPanel.js';
import { MyHand } from './MyHand.js';
import { AuctionPanel } from './AuctionPanel.js';
import { TurnPanel } from './TurnPanel.js';
import { FreeActionPanel } from './FreeActionPanel.js';
import { PromptModal } from './PromptModal.js';
import { LogFeed } from './LogFeed.js';
import { GameOverPanel } from './GameOverPanel.js';

interface Props {
  state: ProjectedGameState;
  log: GameLogEntry[];
  mode: 'in_game' | 'game_over';
}

export function GameBoard({ state, log, mode }: Props) {
  const myId = state.myPlayer?.playerId;
  if (!myId) {
    return <div className="block">You aren't in this game.</div>;
  }
  if (mode === 'game_over' && state.gameOver) {
    return (
      <div className="gameboard">
        <div className="main">
          <GameOverPanel gameOver={state.gameOver} />
          <PlayersPanel
            players={state.players}
            currentPlayerIndex={state.currentPlayerIndex}
            myPlayer={state.myPlayer}
          />
        </div>
        <div className="sidebar">
          <LogFeed entries={log} />
        </div>
      </div>
    );
  }
  const showPrompt = state.myPrompt && state.myPrompt.type !== 'auction_bid';
  return (
    <div className="gameboard">
      <div className="main">
        <div className="section">
          <h3>Stock Prices</h3>
          <div className="prices">
            {COLORS.map(c => (
              <span key={c} className={`price ${c}`}>{c} ${state.stockPrices[c]}</span>
            ))}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: '#888' }}>
            Turn {state.turnNumber} · Deck {state.mainDeckSize} · Discard {state.discardPileSize} · Insider Tips {state.insiderTipDeckSize} left
          </div>
        </div>
        <MarketPanel market={state.market} />
        <GoalsPanel goals={state.activeGoals} />
        <PlayersPanel
          players={state.players}
          currentPlayerIndex={state.currentPlayerIndex}
          myPlayer={state.myPlayer}
        />
        {state.myPlayer && (
          <MyHand
            player={state.myPlayer}
            canPlayActions={!state.myPrompt && !state.gameOver}
          />
        )}
      </div>
      <div className="sidebar">
        {state.auction && (
          <AuctionPanel
            auction={state.auction}
            players={state.players}
            myPrompt={state.myPrompt}
            myPlayerId={myId}
          />
        )}
        {!state.auction && <TurnPanel state={state} myPlayerId={myId} />}
        <FreeActionPanel state={state} />
        <LogFeed entries={log} />
      </div>
      {showPrompt && state.myPrompt && <PromptModal prompt={state.myPrompt} state={state} />}
    </div>
  );
}
