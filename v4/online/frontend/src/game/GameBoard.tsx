import { useState } from 'react';
import type { GameLogEntry, ProjectedGameState } from '@insider-trading/shared';
import { usePriceHistory } from '../hooks/usePriceHistory.js';
import { Header } from './Header.js';
import { Ticker } from './Ticker.js';
import { RecentTip } from './RecentTip.js';
import { MarketPanel } from './MarketPanel.js';
import { GoalsPanel } from './GoalsPanel.js';
import { PlayersPanel } from './PlayersPanel.js';
import { AuctionPanel } from './AuctionPanel.js';
import { TurnPanel } from './TurnPanel.js';
import { PromptModal } from './PromptModal.js';
import { LogFeed } from './LogFeed.js';
import { GameOverPanel } from './GameOverPanel.js';
import { DieRollOverlay } from './DieRollOverlay.js';
import { HandDock } from './HandDock.js';

interface Props {
  state: ProjectedGameState;
  log: GameLogEntry[];
  mode: 'in_game' | 'game_over';
}

export function GameBoard({ state, log, mode }: Props) {
  const myId = state.myPlayer?.playerId;
  const delta5 = usePriceHistory(state.gameId, state.turnNumber, state.stockPrices);
  const [auctionPickUid, setAuctionPickUid] = useState<string | null>(null);
  const isMyTurn = state.players[state.currentPlayerIndex]?.playerId === myId;
  const canPickAuction =
    isMyTurn && !state.auction && !state.myPrompt && !state.gameOver;

  if (!myId) {
    return (
      <div className="block-shell">
        <div className="block-card">
          <div className="block-card__title">Not Seated</div>
          <div className="block-card__sub">You aren't a player in this game.</div>
        </div>
      </div>
    );
  }

  if (mode === 'game_over' && state.gameOver) {
    return (
      <div className="gameboard" style={{ gridTemplateRows: '76px auto 1fr', paddingBottom: 0 }}>
        <Header state={state} />
        <div style={{ padding: '24px 28px' }}>
          <GameOverPanel gameOver={state.gameOver} state={state} />
        </div>
        <div className="gb-main">
          <div className="gb-col">
            <PlayersPanel
              players={state.players}
              currentPlayerIndex={state.currentPlayerIndex}
              myPlayer={state.myPlayer}
            />
          </div>
          <div className="gb-col">
            <LogFeed entries={log} />
          </div>
        </div>
      </div>
    );
  }

  const showPrompt = state.myPrompt && state.myPrompt.type !== 'auction_bid';
  return (
    <div className="gameboard">
      <Header state={state} />
      <Ticker prices={state.stockPrices} delta5={delta5} />
      <div className="gb-main">
        <div className="gb-col">
          <MarketPanel
            market={state.market}
            onPick={canPickAuction ? uid => setAuctionPickUid(uid) : undefined}
            selectedUid={auctionPickUid}
          />
          <GoalsPanel
            state={state}
            goals={state.activeGoals}
            canClaim={
              !state.gameOver &&
              (!state.myPrompt || state.myPrompt.type === 'auction_bid')
            }
          />
          <RecentTip tips={state.resolvedInsiderTips} deckSize={state.insiderTipDeckSize} />
        </div>
        <div className="gb-col">
          {state.auction ? (
            <AuctionPanel
              auction={state.auction}
              players={state.players}
              myPrompt={state.myPrompt}
              myPlayerId={myId}
              market={state.market}
            />
          ) : (
            <TurnPanel
              state={state}
              myPlayerId={myId}
              pickedCardUid={auctionPickUid}
              onClearPick={() => setAuctionPickUid(null)}
            />
          )}
          <PlayersPanel
            players={state.players}
            currentPlayerIndex={state.currentPlayerIndex}
            myPlayer={state.myPlayer}
          />
          <LogFeed entries={log} />
        </div>
      </div>
      <HandDock
        state={state}
        canPlayActions={
          !state.gameOver &&
          (!state.myPrompt || state.myPrompt.type === 'auction_bid')
        }
      />
      {showPrompt && state.myPrompt && <PromptModal prompt={state.myPrompt} state={state} />}
      <DieRollOverlay log={log} />
    </div>
  );
}
