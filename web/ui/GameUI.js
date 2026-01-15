/**
 * GameUI - Main UI Coordinator (minimal version for testing)
 * Coordinates all UI components and handles game state rendering
 */
import { PHASES, EVENT_TYPES } from '../../src/utils/Constants.js';

export class GameUI {
  constructor(engine, humanPlayerId, app) {
    this.engine = engine;
    this.humanPlayerId = humanPlayerId;
    this.app = app;
    this.currentPhase = null;
  }

  async initialize() {
    console.log('Initializing UI...');

    // Initialize sidebar components (minimal)
    this.initializeStockPrices();
    this.initializeEventLog();
    this.initializeMyGoals();
    this.initializePlayers();

    // Subscribe to events
    this.subscribeToEvents();

    console.log('UI initialized');
  }

  initializeStockPrices() {
    const container = document.getElementById('stock-prices');
    const state = this.engine.getState();

    container.innerHTML = '';
    for (const [color, price] of Object.entries(state.stockPrices)) {
      const item = document.createElement('div');
      item.className = `stock-price-item ${color}`;
      item.innerHTML = `
        <span class="stock-color">${color}</span>
        <span class="stock-price" id="price-${color}">$${price}</span>
      `;
      container.appendChild(item);
    }
  }

  initializeEventLog() {
    const container = document.getElementById('event-log');
    container.innerHTML = '<div class="event-item">Game started!</div>';
  }

  initializeMyGoals() {
    this.updateMyGoals();
  }

  updateMyGoals() {
    const container = document.getElementById('my-goals');
    const state = this.engine.getVisibleState(this.humanPlayerId);
    const myPlayer = state.players.find(p => p.id === this.humanPlayerId);

    if (!myPlayer || !myPlayer.goalCards) {
      container.innerHTML = '<p style="color: #888; font-size: 0.9rem;">No goals yet</p>';
      return;
    }

    const unrevealedGoals = myPlayer.goalCards.filter(g => !g.revealed);
    const revealedGoals = myPlayer.goalCards.filter(g => g.revealed);

    container.innerHTML = '';

    // Show unrevealed goals
    if (unrevealedGoals.length > 0) {
      unrevealedGoals.forEach(goal => {
        const goalCard = document.createElement('div');
        goalCard.className = 'goal-card-mini';
        goalCard.style.cssText = `
          background-color: rgba(255, 255, 255, 0.05);
          padding: 10px;
          border-radius: 5px;
          margin-bottom: 10px;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
        `;
        goalCard.innerHTML = `
          <div style="background-color: rgba(255, 165, 0, 0.2); padding: 5px; border-radius: 3px; margin-bottom: 5px; text-align: center; font-size: 0.8rem;">
            <strong>${goal.stockChange}</strong>
          </div>
          <div style="background-color: rgba(74, 144, 226, 0.2); padding: 5px; border-radius: 3px; margin-bottom: 5px; text-align: center; font-size: 0.8rem;">
            ${goal.goal}
          </div>
          <div style="background-color: rgba(76, 175, 80, 0.2); padding: 5px; border-radius: 3px; text-align: center; font-size: 0.75rem;">
            ${goal.reward}
          </div>
        `;

        // Add hover effect
        goalCard.onmouseenter = () => {
          goalCard.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
          goalCard.style.transform = 'scale(1.02)';
        };
        goalCard.onmouseleave = () => {
          goalCard.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
          goalCard.style.transform = 'scale(1)';
        };

        container.appendChild(goalCard);
      });
    }

    // Show revealed goals (grayed out)
    if (revealedGoals.length > 0) {
      revealedGoals.forEach(goal => {
        const goalCard = document.createElement('div');
        goalCard.className = 'goal-card-mini revealed';
        goalCard.style.cssText = `
          background-color: rgba(255, 255, 255, 0.02);
          padding: 10px;
          border-radius: 5px;
          margin-bottom: 10px;
          font-size: 0.85rem;
          opacity: 0.5;
        `;
        goalCard.innerHTML = `
          <div style="text-align: center; margin-bottom: 5px; color: #888;">
            <strong>✅ Revealed</strong>
          </div>
          <div style="background-color: rgba(255, 165, 0, 0.1); padding: 5px; border-radius: 3px; margin-bottom: 5px; text-align: center; font-size: 0.75rem;">
            ${goal.stockChange}
          </div>
          <div style="background-color: rgba(74, 144, 226, 0.1); padding: 5px; border-radius: 3px; margin-bottom: 5px; text-align: center; font-size: 0.75rem;">
            ${goal.goal}
          </div>
        `;

        container.appendChild(goalCard);
      });
    }

    if (unrevealedGoals.length === 0 && revealedGoals.length === 0) {
      container.innerHTML = '<p style="color: #888; font-size: 0.9rem;">No goals remaining</p>';
    }
  }

  initializePlayers() {
    const container = document.getElementById('players-area');
    const state = this.engine.getState();

    container.innerHTML = '';
    for (const player of state.players) {
      const isHuman = player.id === this.humanPlayerId;
      const card = document.createElement('div');
      card.className = `player-card ${isHuman ? 'human' : ''}`;
      card.id = `player-${player.id}`;

      card.innerHTML = `
        <div class="player-header">
          <span class="player-name">${player.name}</span>
          <span class="player-type ${isHuman ? 'human' : 'ai'}">${isHuman ? 'You' : 'AI'}</span>
        </div>
        <div class="player-stats">
          <div class="stat">
            <span class="stat-label">Cash</span>
            <span class="stat-value" id="cash-${player.id}">$${player.cash}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Cards</span>
            <span class="stat-value" id="cards-${player.id}">${player.hand.length}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Goals</span>
            <span class="stat-value" id="goals-${player.id}">${player.goalCards.length}</span>
          </div>
        </div>
        <div class="player-cards">
          <div class="player-hand" id="hand-${player.id}"></div>
        </div>
      `;

      container.appendChild(card);
      this.updatePlayerHand(player.id);
    }
  }

  updatePlayerHand(playerId) {
    const container = document.getElementById(`hand-${playerId}`);
    const state = this.engine.getVisibleState(this.humanPlayerId);
    const player = state.players.find(p => p.id === playerId);

    if (!player) return;

    container.innerHTML = '';
    for (const card of player.hand) {
      const miniCard = document.createElement('div');
      miniCard.className = `mini-card ${card.color}`;
      miniCard.textContent = card.color === 'hidden' ? '?' : card.color[0];
      container.appendChild(miniCard);
    }
  }

  subscribeToEvents() {
    // Update UI on any state change
    this.engine.on(EVENT_TYPES.STOCK_PRICES_UPDATED, (data) => {
      this.updateStockPrices(data.newPrices);
      this.addEventLogItem(`Stock prices updated`);
    });

    this.engine.on(EVENT_TYPES.BID_PLACED, (data) => {
      this.addEventLogItem(`${this.getPlayerName(data.playerId)} bid $${data.amount}`);
      this.updatePlayers();

      // Re-render auction panel to show updated bid
      if (this.currentPhase === PHASES.AUCTION) {
        const panel = document.getElementById('phase-panel');
        if (panel) {
          this.renderAuctionPanel(panel);
        }
      }
    });

    this.engine.on(EVENT_TYPES.AUCTION_WON, (data) => {
      this.addEventLogItem(`${this.getPlayerName(data.playerId)} won ${data.card.color} for $${data.amount}`);
      this.updatePlayers();

      // Re-render auction panel for next card
      setTimeout(() => {
        if (this.currentPhase === PHASES.AUCTION) {
          const panel = document.getElementById('phase-panel');
          if (panel) {
            this.renderAuctionPanel(panel);
          }
        }
      }, 500);
    });

    this.engine.on(EVENT_TYPES.PLAYER_PASSED, (data) => {
      this.addEventLogItem(`${this.getPlayerName(data.playerId)} passed`);

      // Re-render auction panel to update turn indicator
      if (this.currentPhase === PHASES.AUCTION) {
        const panel = document.getElementById('phase-panel');
        if (panel) {
          this.renderAuctionPanel(panel);
        }
      }
    });

    this.engine.on(EVENT_TYPES.CARD_REVEALED, (data) => {
      // Re-render auction panel when new card is revealed
      if (this.currentPhase === PHASES.AUCTION) {
        const panel = document.getElementById('phase-panel');
        if (panel) {
          this.renderAuctionPanel(panel);
        }
      }
    });

    this.engine.on(EVENT_TYPES.GOAL_REVEALED, (data) => {
      this.addEventLogItem(`${this.getPlayerName(data.playerId)} revealed a goal`);
      this.updatePlayers();
      this.updateMyGoals();
    });

    this.engine.on(EVENT_TYPES.REWARD_AVAILABLE, (data) => {
      // Re-render goal panel to show reward execution UI
      if (this.currentPhase === PHASES.GOAL_RESOLUTION) {
        const panel = document.getElementById('phase-panel');
        if (panel) {
          this.renderGoalPanel(panel);
        }
      }
    });

    this.engine.on(EVENT_TYPES.REWARD_EXECUTED, (data) => {
      this.addEventLogItem(`🎁 ${this.getPlayerName(data.playerId)} executed reward`);
      this.updatePlayers();

      // Handle look_at_hand reward - show the target's hand
      if (data.type === 'look_at_hand' && data.playerId === this.humanPlayerId) {
        this.showPlayerHand(data.targetPlayerId, data.hand);
      }

      // Re-render goal panel to show next player's turn
      if (this.currentPhase === PHASES.GOAL_RESOLUTION) {
        const panel = document.getElementById('phase-panel');
        if (panel) {
          this.renderGoalPanel(panel);
        }
      }
    });

    this.engine.on(EVENT_TYPES.TRADE_PROPOSED, (data) => {
      this.addEventLogItem(`${this.getPlayerName(data.playerId)} proposed a trade`);

      // Re-render trading panel to show new offer
      if (this.currentPhase === PHASES.TRADING) {
        const panel = document.getElementById('phase-panel');
        if (panel) {
          this.renderTradingPanel(panel);
        }
      }
    });

    this.engine.on(EVENT_TYPES.TRADE_ACCEPTED, (data) => {
      this.addEventLogItem(`${this.getPlayerName(data.acceptingPlayer)} accepted a trade!`);
      this.updatePlayers();

      // Re-render trading panel to remove accepted offer
      if (this.currentPhase === PHASES.TRADING) {
        const panel = document.getElementById('phase-panel');
        if (panel) {
          this.renderTradingPanel(panel);
        }
      }
    });

    this.engine.on(EVENT_TYPES.TRADE_CANCELLED, (data) => {
      this.addEventLogItem(`Trade cancelled`);

      // Re-render trading panel to remove cancelled offer
      if (this.currentPhase === PHASES.TRADING) {
        const panel = document.getElementById('phase-panel');
        if (panel) {
          this.renderTradingPanel(panel);
        }
      }
    });
  }

  onPhaseChange(data) {
    this.currentPhase = data.toPhase;
    this.updateGameStatus(data.round, data.toPhase);
    this.renderPhasePanel(data.toPhase);
    this.addEventLogItem(`Phase: ${data.toPhase} (Round ${data.round})`);
    this.updatePlayers();
  }

  updateGameStatus(round, phase) {
    document.getElementById('round').textContent = round;
    document.getElementById('phase').textContent = phase;
  }

  updateStockPrices(prices) {
    for (const [color, price] of Object.entries(prices)) {
      const elem = document.getElementById(`price-${color}`);
      if (elem) {
        elem.textContent = `$${price}`;
        elem.classList.add('price-change');
        setTimeout(() => elem.classList.remove('price-change'), 500);
      }
    }
  }

  updatePlayers() {
    const state = this.engine.getVisibleState(this.humanPlayerId);
    for (const player of state.players) {
      const cashElem = document.getElementById(`cash-${player.id}`);
      const cardsElem = document.getElementById(`cards-${player.id}`);
      const goalsElem = document.getElementById(`goals-${player.id}`);

      if (cashElem) cashElem.textContent = `$${player.cash}`;
      if (cardsElem) cardsElem.textContent = player.hand.length;
      if (goalsElem) goalsElem.textContent = player.goalCards.filter(g => !g.revealed).length;

      this.updatePlayerHand(player.id);
    }
  }

  addEventLogItem(message) {
    const container = document.getElementById('event-log');
    const item = document.createElement('div');
    item.className = 'event-item';

    const time = new Date().toLocaleTimeString();
    item.innerHTML = `<span class="timestamp">${time}</span>${message}`;

    container.insertBefore(item, container.firstChild);

    // Keep only last 20 events
    while (container.children.length > 20) {
      container.removeChild(container.lastChild);
    }
  }

  renderPhasePanel(phase) {
    const panel = document.getElementById('phase-panel');

    switch (phase) {
      case PHASES.AUCTION:
        this.renderAuctionPanel(panel);
        break;
      case PHASES.TRADING:
        this.renderTradingPanel(panel);
        break;
      case PHASES.GOAL_RESOLUTION:
        this.renderGoalPanel(panel);
        break;
      case PHASES.SELL:
        this.renderSellPanel(panel);
        break;
      default:
        panel.innerHTML = '<p>Loading...</p>';
    }
  }

  renderAuctionPanel(panel) {
    const state = this.engine.getState();
    const auction = state.phaseState.auction;

    if (!auction || !auction.currentCard) {
      panel.innerHTML = '<p>Preparing auction...</p>';
      return;
    }

    const myPlayer = state.players.find(p => p.id === this.humanPlayerId);
    const nextBid = auction.currentBid + 1;
    const maxBid = myPlayer.cash;
    const canAffordBid = nextBid <= maxBid;

    // Get remaining cards count
    const remainingCards = auction.cardsToAuction.length;

    // Determine whose turn it is
    const currentPlayerId = this.app.getCurrentPlayer();
    const isMyTurn = currentPlayerId === this.humanPlayerId;
    const currentPlayerName = currentPlayerId ? this.getPlayerName(currentPlayerId) : 'Current Player';

    panel.innerHTML = `
      <h2 class="phase-title">Auction Phase</h2>
      <p class="phase-description">Bid on resources to build your collection</p>

      <div id="turn-indicator" style="text-align: center; margin: 20px 0; padding: 10px; border-radius: 5px; ${isMyTurn ? 'background-color: rgba(74, 144, 226, 0.2); color: #4a90e2;' : 'background-color: rgba(255, 255, 255, 0.05);'}">
        <strong>${isMyTurn ? '🎯 Your Turn!' : `⏳ ${currentPlayerName}'s Turn`}</strong>
      </div>

      <div style="text-align: center; margin: 40px 0;">
        <div class="resource-card ${auction.currentCard.color}" style="margin: 0 auto;">
          ${auction.currentCard.color}
        </div>
        <p style="margin-top: 20px; font-size: 1.2rem;">
          Current Bid: <strong id="current-bid-display">$${auction.currentBid}</strong>
          ${auction.currentBidder ? ` by <span style="color: #4a90e2;">${this.getPlayerName(auction.currentBidder)}</span>` : ' (No bids yet)'}
        </p>
        <p style="margin-top: 10px; color: #888; font-size: 0.9rem;">
          ${remainingCards} card${remainingCards !== 1 ? 's' : ''} remaining in auction
        </p>
        <p style="margin-top: 5px; color: #888; font-size: 0.9rem;">
          Your cash: <strong style="color: #4caf50;">$${myPlayer.cash}</strong>
        </p>
      </div>

      <div id="auction-controls" class="flex gap-20" style="justify-content: center; align-items: center; display: none; margin-top: 30px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <label for="bid-amount" style="font-size: 1rem;">Bid Amount:</label>
          <input
            type="number"
            id="bid-amount"
            min="${nextBid}"
            max="${maxBid}"
            value="${nextBid}"
            style="width: 100px; padding: 8px; font-size: 1rem;"
          >
        </div>
        <button class="primary-btn" id="place-bid-btn" ${!canAffordBid ? 'disabled' : ''}>
          Place Bid ($${nextBid})
        </button>
        <button class="secondary-btn" id="pass-btn">Pass</button>
      </div>

      ${!canAffordBid && isMyTurn ? `
        <div style="text-align: center; margin-top: 20px; color: #ff6b6b; font-size: 0.9rem;">
          ⚠️ You cannot afford the minimum bid of $${nextBid}
        </div>
      ` : ''}
    `;
  }

  renderTradingPanel(panel) {
    const state = this.engine.getState();
    const tradingState = state.phaseState.trading;
    const myPlayer = state.players.find(p => p.id === this.humanPlayerId);
    const activeOffers = tradingState.activeOffers || [];

    // Filter offers to show only those from other players
    const offersFromOthers = activeOffers.filter(offer => offer.offeringPlayer !== this.humanPlayerId);
    const myOffers = activeOffers.filter(offer => offer.offeringPlayer === this.humanPlayerId);

    panel.innerHTML = `
      <h2 class="phase-title">Trading Phase</h2>
      <p class="phase-description">Trade resources with other players (you have infinite time)</p>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px;">
        <!-- Active Trade Offers -->
        <div style="background-color: rgba(255, 255, 255, 0.03); padding: 20px; border-radius: 10px;">
          <h3 style="margin-bottom: 15px;">📥 Available Trade Offers</h3>
          <div id="active-offers-list">
            ${offersFromOthers.length === 0 ?
              '<p style="color: #888; font-style: italic;">No trade offers available yet...</p>' :
              offersFromOthers.map(offer => this.renderTradeOffer(offer, state)).join('')
            }
          </div>
        </div>

        <!-- Create Trade Proposal -->
        <div style="background-color: rgba(255, 255, 255, 0.03); padding: 20px; border-radius: 10px;">
          <h3 style="margin-bottom: 15px;">📤 Create Trade Proposal</h3>

          <div style="margin-bottom: 20px;">
            <h4 style="margin-bottom: 10px; color: #4caf50;">You Offer:</h4>
            <div id="offer-cards-selection" style="margin-bottom: 10px;">
              ${myPlayer.hand.map((card, index) => `
                <label style="display: block; margin: 5px 0; cursor: pointer;">
                  <input type="checkbox" id="offer-card-${index}" value="${card.id}" style="margin-right: 8px;">
                  <span class="mini-card ${card.color}" style="display: inline-block; width: 60px; text-align: center; padding: 5px; border-radius: 3px;">${card.color}</span>
                  <span style="margin-left: 10px; color: #888;">($${state.stockPrices[card.color]})</span>
                </label>
              `).join('')}
            </div>
            <div style="margin-top: 10px;">
              <label>Cash: $<input type="number" id="offer-cash" min="0" max="${myPlayer.cash}" value="0" style="width: 80px; padding: 5px;"></label>
              <span style="margin-left: 10px; color: #888;">Available: $${myPlayer.cash}</span>
            </div>
          </div>

          <div style="margin-bottom: 20px;">
            <h4 style="margin-bottom: 10px; color: #ff6b6b;">You Request:</h4>
            ${['Blue', 'Orange', 'Yellow', 'Purple'].map(color => `
              <div style="margin: 5px 0;">
                <label style="display: inline-flex; align-items: center; min-width: 120px;">
                  <span class="mini-card ${color}" style="display: inline-block; width: 60px; text-align: center; padding: 5px; border-radius: 3px; margin-right: 10px;">${color}</span>
                  <input type="number" id="request-${color}" min="0" max="5" value="0" style="width: 50px; padding: 5px;">
                </label>
                <span style="margin-left: 10px; color: #888;">($${state.stockPrices[color]} each)</span>
              </div>
            `).join('')}
            <div style="margin-top: 10px;">
              <label>Cash: $<input type="number" id="request-cash" min="0" value="0" style="width: 80px; padding: 5px;"></label>
            </div>
          </div>

          <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button class="primary-btn" id="propose-trade-btn">Propose Trade</button>
            <button class="secondary-btn" id="calculate-trade-btn">Calculate Value</button>
          </div>
          <div id="trade-value-display" style="margin-top: 15px; padding: 10px; border-radius: 5px; display: none;"></div>
        </div>
      </div>

      <!-- My Active Offers -->
      ${myOffers.length > 0 ? `
        <div style="margin-top: 30px; background-color: rgba(255, 255, 255, 0.03); padding: 20px; border-radius: 10px;">
          <h3 style="margin-bottom: 15px;">📋 Your Active Offers</h3>
          ${myOffers.map(offer => `
            <div style="background-color: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 5px; margin-bottom: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <strong>Offering:</strong> ${this.formatTradeItems(offer.offering, state)}
                  <br>
                  <strong>Requesting:</strong> ${this.formatTradeRequest(offer.requesting, state)}
                </div>
                <button class="secondary-btn" onclick="window.gameUI.cancelTrade('${offer.offerId}')">Cancel</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- End Trading Button -->
      <div style="text-align: center; margin-top: 30px;">
        <button class="primary-btn" id="end-trading-btn" style="padding: 15px 40px; font-size: 1.1rem;">
          End Trading Phase ➡️
        </button>
        <p style="margin-top: 10px; color: #888; font-size: 0.9rem;">You have unlimited time - end when ready</p>
      </div>
    `;

    this.setupTradingControls(state);
  }

  renderGoalPanel(panel) {
    const state = this.engine.getState();
    const goalState = state.phaseState.goalResolution;
    const currentPlayerId = state.turnOrder[goalState.currentPlayerIndex];
    const isMyTurn = currentPlayerId === this.humanPlayerId;
    const currentPlayer = state.players.find(p => p.id === currentPlayerId);

    // Check if we're waiting for reward execution
    const waitingForReward = goalState.pendingRewardExecution !== null;

    panel.innerHTML = `
      <h2 class="phase-title">Goal Resolution Phase</h2>
      <p class="phase-description">Players reveal their goals and collect rewards</p>

      <div style="text-align: center; margin: 20px 0; padding: 10px; border-radius: 5px; ${isMyTurn ? 'background-color: rgba(74, 144, 226, 0.2); color: #4a90e2;' : 'background-color: rgba(255, 255, 255, 0.05);'}">
        <strong>${isMyTurn ? '🎯 Your Turn to Reveal a Goal' : `⏳ ${this.getPlayerName(currentPlayerId)}'s Turn`}</strong>
      </div>

      ${isMyTurn && !waitingForReward ? this.renderGoalSelection(currentPlayer, state) : this.renderWaitingForGoal(currentPlayer, state)}

      ${waitingForReward ? this.renderRewardExecution(goalState, state) : ''}

      <!-- Recently Revealed Goals -->
      ${goalState.revealedGoals && goalState.revealedGoals.length > 0 ? `
        <div style="margin-top: 30px; background-color: rgba(255, 255, 255, 0.03); padding: 20px; border-radius: 10px;">
          <h3 style="margin-bottom: 15px;">✨ Goals Revealed This Round</h3>
          ${goalState.revealedGoals.map(revealed => this.renderRevealedGoal(revealed, state)).join('')}
        </div>
      ` : ''}
    `;

    this.setupGoalControls(state);
  }

  renderGoalSelection(player, state) {
    const unrevealedGoals = player.goalCards.filter(g => !g.revealed);

    if (unrevealedGoals.length === 0) {
      return '<p style="text-align: center; color: #888;">No goals remaining to reveal</p>';
    }

    return `
      <div style="background-color: rgba(255, 255, 255, 0.03); padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 800px;">
        <h3 style="margin-bottom: 15px;">Select a Goal to Reveal:</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
          ${unrevealedGoals.map(goal => `
            <div class="goal-card" style="background-color: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 8px; cursor: pointer; border: 2px solid transparent; transition: all 0.2s;" onclick="window.gameUI.selectGoal('${goal.id}')">
              <div style="background-color: rgba(255, 165, 0, 0.2); padding: 8px; border-radius: 5px; margin-bottom: 10px; text-align: center;">
                <strong>${goal.stockChange}</strong>
              </div>
              <div style="background-color: rgba(74, 144, 226, 0.2); padding: 8px; border-radius: 5px; margin-bottom: 10px; text-align: center;">
                ${goal.goal}
              </div>
              <div style="background-color: rgba(76, 175, 80, 0.2); padding: 8px; border-radius: 5px; text-align: center; font-size: 0.9rem;">
                ${goal.reward}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderWaitingForGoal(player, state) {
    return `
      <div style="text-align: center; margin: 40px 0;">
        <p style="font-size: 1.2rem; color: #888;">
          ${this.getPlayerName(player.id)} is revealing a goal...
        </p>
        <div style="margin-top: 20px;">
          <div class="spinner" style="margin: 0 auto; width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.1); border-top: 4px solid #4a90e2; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        </div>
      </div>
    `;
  }

  renderRevealedGoal(revealed, state) {
    const player = state.players.find(p => p.id === revealed.playerId);
    const goalMet = revealed.goalMet;

    return `
      <div style="background-color: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 4px solid ${goalMet ? '#4caf50' : '#ff6b6b'};">
        <div style="display: flex; justify-content: space-between; align-items: start;">
          <div>
            <strong style="color: #4a90e2; font-size: 1.1rem;">${this.getPlayerName(revealed.playerId)}</strong>
            <span style="margin-left: 10px; padding: 4px 8px; border-radius: 3px; background-color: ${goalMet ? 'rgba(76, 175, 80, 0.3)' : 'rgba(255, 107, 107, 0.3)'}; font-size: 0.9rem;">
              ${goalMet ? '✅ Goal Met!' : '❌ Goal Not Met'}
            </span>
          </div>
        </div>
        <div style="margin-top: 10px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
          <div style="background-color: rgba(255, 165, 0, 0.1); padding: 8px; border-radius: 5px;">
            <div style="font-size: 0.8rem; color: #888; margin-bottom: 4px;">Stock Change:</div>
            <strong>${revealed.goal.stockChange}</strong>
          </div>
          <div style="background-color: rgba(74, 144, 226, 0.1); padding: 8px; border-radius: 5px;">
            <div style="font-size: 0.8rem; color: #888; margin-bottom: 4px;">Goal:</div>
            <strong>${revealed.goal.goal}</strong>
          </div>
          <div style="background-color: rgba(76, 175, 80, 0.1); padding: 8px; border-radius: 5px;">
            <div style="font-size: 0.8rem; color: #888; margin-bottom: 4px;">Reward:</div>
            <strong>${revealed.goal.reward}</strong>
          </div>
        </div>
      </div>
    `;
  }

  renderRewardExecution(goalState, state) {
    const pending = goalState.pendingRewardExecution;
    if (!pending) return '';

    const isMyReward = pending.playerId === this.humanPlayerId;
    const rewardType = pending.rewardType;
    const goalCard = pending.goalCard;

    if (!isMyReward) {
      return `
        <div style="text-align: center; margin: 20px 0; padding: 15px; background-color: rgba(76, 175, 80, 0.1); border-radius: 8px;">
          <p>🎁 ${this.getPlayerName(pending.playerId)} is executing their reward...</p>
        </div>
      `;
    }

    // Human player needs to execute reward
    let rewardUI = '';

    switch (rewardType) {
      case 'look_at_hand':
        const opponents = state.players.filter(p => p.id !== this.humanPlayerId);
        rewardUI = `
          <h3>🎁 Execute Your Reward</h3>
          <p style="margin-bottom: 15px;">${goalCard.reward}</p>
          <div style="margin: 15px 0;">
            <label style="display: block; margin-bottom: 8px; font-weight: bold;">Select a player to view their hand:</label>
            <select id="reward-target-player" style="width: 100%; padding: 10px; border-radius: 5px; background-color: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">
              ${opponents.map(p => `<option value="${p.id}">${this.getPlayerName(p.id)} (${p.hand.length} cards)</option>`).join('')}
            </select>
          </div>
          <button onclick="window.gameUI.executeReward()" style="width: 100%; padding: 12px; background-color: #4caf50; color: white; border: none; border-radius: 5px; font-size: 1.1rem; cursor: pointer; margin-top: 10px;">
            View Hand
          </button>
        `;
        break;

      case 'steal_cash':
        const opponentsWithCash = state.players.filter(p => p.id !== this.humanPlayerId);
        rewardUI = `
          <h3>🎁 Execute Your Reward</h3>
          <p style="margin-bottom: 15px;">${goalCard.reward}</p>
          <div style="margin: 15px 0;">
            <label style="display: block; margin-bottom: 8px; font-weight: bold;">Select a player to steal $1 from:</label>
            <select id="reward-target-player" style="width: 100%; padding: 10px; border-radius: 5px; background-color: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">
              ${opponentsWithCash.map(p => `<option value="${p.id}">${this.getPlayerName(p.id)} ($${p.cash})</option>`).join('')}
            </select>
          </div>
          <button onclick="window.gameUI.executeReward()" style="width: 100%; padding: 12px; background-color: #4caf50; color: white; border: none; border-radius: 5px; font-size: 1.1rem; cursor: pointer; margin-top: 10px;">
            Steal $1
          </button>
        `;
        break;

      case 'adjust_stock':
        rewardUI = `
          <h3>🎁 Execute Your Reward</h3>
          <p style="margin-bottom: 15px;">${goalCard.reward}</p>
          <div style="margin: 15px 0;">
            <label style="display: block; margin-bottom: 8px; font-weight: bold;">Select a stock to adjust:</label>
            <select id="reward-stock-color" style="width: 100%; padding: 10px; border-radius: 5px; background-color: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); margin-bottom: 10px;">
              <option value="Blue">Blue ($${state.stockPrices.Blue})</option>
              <option value="Orange">Orange ($${state.stockPrices.Orange})</option>
              <option value="Yellow">Yellow ($${state.stockPrices.Yellow})</option>
              <option value="Purple">Purple ($${state.stockPrices.Purple})</option>
            </select>
            <label style="display: block; margin-bottom: 8px; font-weight: bold;">Direction:</label>
            <select id="reward-stock-direction" style="width: 100%; padding: 10px; border-radius: 5px; background-color: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2);">
              <option value="1">Increase (+$1)</option>
              <option value="-1">Decrease (-$1)</option>
            </select>
          </div>
          <button onclick="window.gameUI.executeReward()" style="width: 100%; padding: 12px; background-color: #4caf50; color: white; border: none; border-radius: 5px; font-size: 1.1rem; cursor: pointer; margin-top: 10px;">
            Adjust Stock Price
          </button>
        `;
        break;

      default:
        // For rewards that don't require choices, show a button to continue
        rewardUI = `
          <h3>🎁 Reward Executed!</h3>
          <p style="margin-bottom: 15px;">${goalCard.reward}</p>
          <button onclick="window.gameUI.executeReward()" style="width: 100%; padding: 12px; background-color: #4caf50; color: white; border: none; border-radius: 5px; font-size: 1.1rem; cursor: pointer; margin-top: 10px;">
            Continue
          </button>
        `;
    }

    return `
      <div style="margin: 20px auto; max-width: 600px; padding: 20px; background-color: rgba(76, 175, 80, 0.1); border-radius: 8px; border: 2px solid rgba(76, 175, 80, 0.3);">
        ${rewardUI}
      </div>
    `;
  }

  setupGoalControls(state) {
    // Make GameUI accessible for onclick handlers
    window.gameUI = this;
  }

  selectGoal(goalCardId) {
    try {
      this.app.executeHumanAction({
        type: 'REVEAL_GOAL',
        playerId: this.humanPlayerId,
        goalCardId: goalCardId
      });
      this.addEventLogItem('✅ Goal revealed!');
    } catch (error) {
      this.addEventLogItem(`❌ Goal reveal failed: ${error.message}`);
    }
  }

  executeReward() {
    try {
      const state = this.engine.getState();
      const pending = state.phaseState.goalResolution.pendingRewardExecution;

      if (!pending) {
        this.addEventLogItem('❌ No pending reward to execute');
        return;
      }

      const rewardType = pending.rewardType;
      let choices = {};

      // Collect choices based on reward type
      switch (rewardType) {
        case 'look_at_hand':
        case 'steal_cash':
          const targetSelect = document.getElementById('reward-target-player');
          if (targetSelect) {
            choices.targetPlayerId = targetSelect.value;
          }
          break;

        case 'adjust_stock':
          const colorSelect = document.getElementById('reward-stock-color');
          const directionSelect = document.getElementById('reward-stock-direction');
          if (colorSelect && directionSelect) {
            choices.color = colorSelect.value;
            choices.direction = parseInt(directionSelect.value);
          }
          break;

        default:
          // No choices needed
          break;
      }

      this.app.executeHumanAction({
        type: 'EXECUTE_REWARD',
        playerId: this.humanPlayerId,
        choices: choices
      });
      this.addEventLogItem('🎁 Reward executed!');
    } catch (error) {
      this.addEventLogItem(`❌ Reward execution failed: ${error.message}`);
    }
  }

  renderSellPanel(panel) {
    const state = this.engine.getState();
    const sellState = state.phaseState.sell;
    const myPlayer = state.players.find(p => p.id === this.humanPlayerId);
    const mySelection = sellState.playerSelections[this.humanPlayerId] || { cardsToSell: [], committed: false };

    // Check if all players have committed
    const allPlayersCommitted = state.players.every(p => {
      const selection = sellState.playerSelections[p.id];
      return selection && selection.committed;
    });

    panel.innerHTML = `
      <h2 class="phase-title">Sell Phase</h2>
      <p class="phase-description">Sell your resources at current market prices</p>

      ${!mySelection.committed ? `
        <div style="background-color: rgba(255, 255, 255, 0.03); padding: 20px; border-radius: 10px; margin: 20px auto; max-width: 700px;">
          <h3 style="margin-bottom: 15px;">Select Cards to Sell:</h3>

          ${myPlayer.hand.length === 0 ? `
            <p style="text-align: center; color: #888; font-style: italic;">You have no cards to sell</p>
          ` : `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 15px; margin-bottom: 20px;">
              ${myPlayer.hand.map((card, index) => `
                <label style="cursor: pointer;">
                  <div class="resource-card ${card.color}" style="position: relative; padding: 20px; border-radius: 8px; border: 2px solid transparent; transition: all 0.2s;">
                    <input type="checkbox" id="sell-card-${index}" value="${card.id}" style="position: absolute; top: 10px; right: 10px; width: 20px; height: 20px; cursor: pointer;">
                    <div style="text-align: center;">
                      <div style="font-size: 1.2rem; font-weight: bold; margin-bottom: 5px;">${card.color}</div>
                      <div style="font-size: 0.9rem; color: rgba(255, 255, 255, 0.8);">Sell for $${state.stockPrices[card.color]}</div>
                    </div>
                  </div>
                </label>
              `).join('')}
            </div>

            <div style="background-color: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 1.1rem;">Total Sell Value:</span>
                <span id="sell-total-value" style="font-size: 1.5rem; font-weight: bold; color: #4caf50;">$0</span>
              </div>
              <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #888;">Your current cash:</span>
                  <span style="font-weight: bold;">$${myPlayer.cash}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 5px;">
                  <span style="color: #888;">Cash after selling:</span>
                  <span id="cash-after-sell" style="font-weight: bold; color: #4caf50;">$${myPlayer.cash}</span>
                </div>
              </div>
            </div>
          `}

          <div style="text-align: center;">
            <button class="primary-btn" id="commit-sell-btn" style="padding: 15px 40px; font-size: 1.1rem;">
              Commit Selection ✅
            </button>
            <p style="margin-top: 10px; color: #888; font-size: 0.9rem;">
              ${myPlayer.hand.length > 0 ? 'Select cards and commit when ready' : 'Click commit to continue'}
            </p>
          </div>
        </div>
      ` : `
        <div style="text-align: center; margin: 40px 0;">
          <div style="display: inline-block; padding: 30px 50px; background-color: rgba(76, 175, 80, 0.2); border-radius: 10px;">
            <div style="font-size: 3rem; margin-bottom: 10px;">✅</div>
            <div style="font-size: 1.2rem; font-weight: bold; color: #4caf50;">Selection Committed!</div>
            <p style="margin-top: 10px; color: #888;">Waiting for other players...</p>
          </div>

          ${mySelection.cardsToSell.length > 0 ? `
            <div style="margin-top: 30px; background-color: rgba(255, 255, 255, 0.03); padding: 20px; border-radius: 10px; max-width: 500px; margin-left: auto; margin-right: auto;">
              <h4 style="margin-bottom: 15px;">Your Selection:</h4>
              <p style="color: #888;">
                Selling ${mySelection.cardsToSell.length} card${mySelection.cardsToSell.length !== 1 ? 's' : ''}
              </p>
            </div>
          ` : `
            <p style="margin-top: 20px; color: #888;">You chose not to sell any cards</p>
          `}
        </div>
      `}

      <!-- Other Players' Status -->
      <div style="margin-top: 30px; background-color: rgba(255, 255, 255, 0.03); padding: 20px; border-radius: 10px;">
        <h3 style="margin-bottom: 15px;">Players' Status:</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
          ${state.players.map(player => {
            const selection = sellState.playerSelections[player.id];
            const committed = selection && selection.committed;
            return `
              <div style="background-color: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 8px; border-left: 4px solid ${committed ? '#4caf50' : '#888'};">
                <div style="font-weight: bold; margin-bottom: 5px;">${player.name}</div>
                <div style="color: ${committed ? '#4caf50' : '#888'}; font-size: 0.9rem;">
                  ${committed ? '✅ Committed' : '⏳ Deciding...'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    this.setupSellControls(state);
  }

  setupSellControls(state) {
    const myPlayer = state.players.find(p => p.id === this.humanPlayerId);

    // Update total value when checkboxes change
    if (myPlayer.hand.length > 0) {
      myPlayer.hand.forEach((card, index) => {
        const checkbox = document.getElementById(`sell-card-${index}`);
        if (checkbox) {
          checkbox.addEventListener('change', () => this.updateSellTotal(state));
        }
      });
    }

    // Commit button
    const commitBtn = document.getElementById('commit-sell-btn');
    if (commitBtn) {
      commitBtn.onclick = () => this.commitSellSelection(state);
    }

    // Initial calculation
    this.updateSellTotal(state);
  }

  updateSellTotal(state) {
    const myPlayer = state.players.find(p => p.id === this.humanPlayerId);
    let totalValue = 0;
    const selectedCards = [];

    myPlayer.hand.forEach((card, index) => {
      const checkbox = document.getElementById(`sell-card-${index}`);
      if (checkbox && checkbox.checked) {
        totalValue += state.stockPrices[card.color];
        selectedCards.push(card.id);
      }
    });

    const totalDisplay = document.getElementById('sell-total-value');
    const cashAfterDisplay = document.getElementById('cash-after-sell');

    if (totalDisplay) {
      totalDisplay.textContent = `$${totalValue}`;
    }

    if (cashAfterDisplay) {
      cashAfterDisplay.textContent = `$${myPlayer.cash + totalValue}`;
    }
  }

  commitSellSelection(state) {
    const myPlayer = state.players.find(p => p.id === this.humanPlayerId);
    const selectedCards = [];

    myPlayer.hand.forEach((card, index) => {
      const checkbox = document.getElementById(`sell-card-${index}`);
      if (checkbox && checkbox.checked) {
        selectedCards.push(card.id);
      }
    });

    try {
      // First select the cards
      if (selectedCards.length > 0) {
        this.app.executeHumanAction({
          type: 'SELECT_CARDS_TO_SELL',
          playerId: this.humanPlayerId,
          cardIds: selectedCards
        });
      }

      // Then commit
      this.app.executeHumanAction({
        type: 'COMMIT_SELL',
        playerId: this.humanPlayerId
      });

      this.addEventLogItem(`✅ Committed to sell ${selectedCards.length} card${selectedCards.length !== 1 ? 's' : ''}`);
    } catch (error) {
      this.addEventLogItem(`❌ Sell commit failed: ${error.message}`);
    }
  }

  enableHumanControls() {
    const state = this.engine.getState();

    if (state.currentPhase === PHASES.AUCTION) {
      const controls = document.getElementById('auction-controls');
      if (!controls) return;

      controls.style.display = 'flex';

      const myPlayer = state.players.find(p => p.id === this.humanPlayerId);
      const auction = state.phaseState.auction;
      const bidInput = document.getElementById('bid-amount');
      const placeBidBtn = document.getElementById('place-bid-btn');
      const passBtn = document.getElementById('pass-btn');

      if (!bidInput || !placeBidBtn || !passBtn) return;

      // Validate bid amount on input change
      const validateBid = () => {
        const amount = parseInt(bidInput.value);
        const minBid = auction.currentBid + 1;
        const maxBid = myPlayer.cash;

        if (isNaN(amount) || amount < minBid || amount > maxBid) {
          placeBidBtn.disabled = true;
          placeBidBtn.textContent = 'Invalid Bid';
        } else {
          placeBidBtn.disabled = false;
          placeBidBtn.textContent = `Place Bid ($${amount})`;
        }
      };

      // Update button text on input
      bidInput.addEventListener('input', validateBid);

      // Handle bid placement
      const placeBid = () => {
        const amount = parseInt(bidInput.value);
        const minBid = auction.currentBid + 1;
        const maxBid = myPlayer.cash;

        // Validate
        if (isNaN(amount) || amount < minBid || amount > maxBid) {
          this.addEventLogItem(`❌ Invalid bid amount: $${amount}`);
          return;
        }

        // Disable controls immediately to prevent double-clicks
        this.disableHumanControls();

        // Execute action
        try {
          this.app.executeHumanAction({
            type: 'PLACE_BID',
            playerId: this.humanPlayerId,
            amount
          });
        } catch (error) {
          this.addEventLogItem(`❌ Bid failed: ${error.message}`);
          // Re-enable controls on error
          this.enableHumanControls();
        }
      };

      const pass = () => {
        // Disable controls immediately
        this.disableHumanControls();

        try {
          this.app.executeHumanAction({
            type: 'PASS',
            playerId: this.humanPlayerId
          });
        } catch (error) {
          this.addEventLogItem(`❌ Pass failed: ${error.message}`);
          this.enableHumanControls();
        }
      };

      placeBidBtn.onclick = placeBid;
      passBtn.onclick = pass;

      // Keyboard support: Enter to bid, Escape to pass
      bidInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !placeBidBtn.disabled) {
          e.preventDefault();
          placeBid();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          pass();
        }
      });

      // Focus the input field for immediate typing
      bidInput.focus();
      bidInput.select();

      // Initial validation
      validateBid();
    }
  }

  disableHumanControls() {
    const controls = document.getElementById('auction-controls');
    if (controls) {
      controls.style.display = 'none';
    }
  }

  showGameOver(data) {
    document.getElementById('game-over-screen').classList.remove('hidden');
    const scoresDiv = document.getElementById('final-scores');

    scoresDiv.innerHTML = `
      <h3>Winner: ${data.winner.name}</h3>
      <div style="margin-top: 30px;">
        ${data.finalScores.map((score, index) => `
          <div style="margin: 10px 0; font-size: 1.2rem;">
            ${index + 1}. ${score.name}: $${score.wealth}
          </div>
        `).join('')}
      </div>
    `;
  }

  getPlayerName(playerId) {
    const state = this.engine.getState();
    const player = state.players.find(p => p.id === playerId);
    return player ? player.name : playerId;
  }

  // Trading Panel Helper Methods

  renderTradeOffer(offer, state) {
    const offerValue = this.calculateTradeOfferValue(offer, state);
    const offerValueText = offerValue > 0 ? `+$${offerValue}` : offerValue < 0 ? `-$${Math.abs(offerValue)}` : '$0';
    const offerValueColor = offerValue > 0 ? '#4caf50' : offerValue < 0 ? '#ff6b6b' : '#888';

    return `
      <div style="background-color: rgba(255, 255, 255, 0.05); padding: 15px; border-radius: 5px; margin-bottom: 15px; border-left: 3px solid ${offerValue > 0 ? '#4caf50' : '#888'};">
        <div style="margin-bottom: 10px;">
          <strong style="color: #4a90e2;">${this.getPlayerName(offer.offeringPlayer)} offers:</strong>
        </div>
        <div style="margin-left: 15px; margin-bottom: 10px;">
          <div><strong>Giving:</strong> ${this.formatTradeItems(offer.offering, state)}</div>
          <div><strong>Wants:</strong> ${this.formatTradeRequest(offer.requesting, state)}</div>
        </div>
        <div style="display: flex; gap: 10px; align-items: center; margin-top: 10px;">
          <button class="primary-btn" onclick="window.gameUI.acceptTrade('${offer.offerId}')" style="padding: 8px 16px;">
            Accept Trade
          </button>
          <span style="color: ${offerValueColor}; font-weight: bold;">
            Net Value: ${offerValueText}
          </span>
        </div>
      </div>
    `;
  }

  formatTradeItems(offering, state) {
    const parts = [];
    if (offering.cards && offering.cards.length > 0) {
      // Handle both card IDs (strings) and card objects
      const cardColors = offering.cards.map(c => {
        if (typeof c === 'string') {
          // It's a card ID, need to look up the color
          // Find the card in all players' hands
          for (const player of state.players) {
            const card = player.hand.find(card => card.id === c);
            if (card) return card.color;
          }
          return 'Unknown';
        } else {
          // It's already a card object
          return c.color;
        }
      });
      const colorCounts = {};
      cardColors.forEach(color => {
        colorCounts[color] = (colorCounts[color] || 0) + 1;
      });
      parts.push(Object.entries(colorCounts).map(([color, count]) =>
        `${count}× ${color} ($${state.stockPrices[color] * count})`
      ).join(', '));
    }
    if (offering.cash && offering.cash > 0) {
      parts.push(`$${offering.cash}`);
    }
    return parts.length > 0 ? parts.join(' + ') : 'Nothing';
  }

  formatTradeRequest(requesting, state) {
    const parts = [];
    if (requesting.cards && requesting.cards.length > 0) {
      parts.push(requesting.cards.map(req =>
        `${req.count}× ${req.color} ($${state.stockPrices[req.color] * req.count})`
      ).join(', '));
    }
    if (requesting.cash && requesting.cash > 0) {
      parts.push(`$${requesting.cash}`);
    }
    return parts.length > 0 ? parts.join(' + ') : 'Nothing';
  }

  calculateTradeOfferValue(offer, state) {
    // Calculate what we receive minus what we give
    let receiveValue = offer.offering.cash || 0;
    if (offer.offering.cards) {
      receiveValue += offer.offering.cards.reduce((sum, card) =>
        sum + state.stockPrices[card.color], 0
      );
    }

    let giveValue = offer.requesting.cash || 0;
    if (offer.requesting.cards) {
      giveValue += offer.requesting.cards.reduce((sum, req) =>
        sum + (state.stockPrices[req.color] * req.count), 0
      );
    }

    return receiveValue - giveValue;
  }

  setupTradingControls(state) {
    // Make GameUI accessible globally for onclick handlers
    window.gameUI = this;

    // End trading button
    const endTradingBtn = document.getElementById('end-trading-btn');
    if (endTradingBtn) {
      endTradingBtn.onclick = () => {
        this.app.executeHumanAction({
          type: 'END_TRADING',
          playerId: this.humanPlayerId
        });
      };
    }

    // Propose trade button
    const proposeTradingBtn = document.getElementById('propose-trade-btn');
    if (proposeTradingBtn) {
      proposeTradingBtn.onclick = () => this.proposeTrade(state);
    }

    // Calculate trade value button
    const calculateBtn = document.getElementById('calculate-trade-btn');
    if (calculateBtn) {
      calculateBtn.onclick = () => this.calculateProposedTradeValue(state);
    }
  }

  proposeTrade(state) {
    const myPlayer = state.players.find(p => p.id === this.humanPlayerId);

    // Collect selected cards to offer
    const selectedCards = [];
    myPlayer.hand.forEach((card, index) => {
      const checkbox = document.getElementById(`offer-card-${index}`);
      if (checkbox && checkbox.checked) {
        selectedCards.push(card.id);
      }
    });

    // Collect cash to offer
    const offerCash = parseInt(document.getElementById('offer-cash').value) || 0;

    // Collect requested cards
    const requestedCards = [];
    ['Blue', 'Orange', 'Yellow', 'Purple'].forEach(color => {
      const count = parseInt(document.getElementById(`request-${color}`).value) || 0;
      if (count > 0) {
        requestedCards.push({ color, count });
      }
    });

    // Collect requested cash
    const requestCash = parseInt(document.getElementById('request-cash').value) || 0;

    // Validate
    if (selectedCards.length === 0 && offerCash === 0) {
      this.addEventLogItem('❌ You must offer something');
      return;
    }

    if (requestedCards.length === 0 && requestCash === 0) {
      this.addEventLogItem('❌ You must request something');
      return;
    }

    if (offerCash > myPlayer.cash) {
      this.addEventLogItem('❌ You don\'t have that much cash');
      return;
    }

    // Create trade action
    const action = {
      type: 'PROPOSE_TRADE',
      playerId: this.humanPlayerId,
      offering: {
        cards: selectedCards,
        cash: offerCash
      },
      requesting: {
        cards: requestedCards,
        cash: requestCash
      }
    };

    try {
      this.app.executeHumanAction(action);
      this.addEventLogItem('✅ Trade proposed!');

      // Clear form
      myPlayer.hand.forEach((_, index) => {
        const checkbox = document.getElementById(`offer-card-${index}`);
        if (checkbox) checkbox.checked = false;
      });
      document.getElementById('offer-cash').value = '0';
      ['Blue', 'Orange', 'Yellow', 'Purple'].forEach(color => {
        document.getElementById(`request-${color}`).value = '0';
      });
      document.getElementById('request-cash').value = '0';
      document.getElementById('trade-value-display').style.display = 'none';
    } catch (error) {
      this.addEventLogItem(`❌ Trade proposal failed: ${error.message}`);
    }
  }

  calculateProposedTradeValue(state) {
    const myPlayer = state.players.find(p => p.id === this.humanPlayerId);

    // Calculate value of what we're offering
    let offerValue = parseInt(document.getElementById('offer-cash').value) || 0;
    myPlayer.hand.forEach((card, index) => {
      const checkbox = document.getElementById(`offer-card-${index}`);
      if (checkbox && checkbox.checked) {
        offerValue += state.stockPrices[card.color];
      }
    });

    // Calculate value of what we're requesting
    let requestValue = parseInt(document.getElementById('request-cash').value) || 0;
    ['Blue', 'Orange', 'Yellow', 'Purple'].forEach(color => {
      const count = parseInt(document.getElementById(`request-${color}`).value) || 0;
      requestValue += state.stockPrices[color] * count;
    });

    const netValue = requestValue - offerValue;
    const display = document.getElementById('trade-value-display');

    if (display) {
      display.style.display = 'block';
      if (netValue > 0) {
        display.style.backgroundColor = 'rgba(76, 175, 80, 0.2)';
        display.style.color = '#4caf50';
        display.innerHTML = `✅ You gain <strong>$${netValue}</strong> in value`;
      } else if (netValue < 0) {
        display.style.backgroundColor = 'rgba(255, 107, 107, 0.2)';
        display.style.color = '#ff6b6b';
        display.innerHTML = `⚠️ You lose <strong>$${Math.abs(netValue)}</strong> in value`;
      } else {
        display.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
        display.style.color = '#888';
        display.innerHTML = '➖ Break-even trade ($0 net value)';
      }
    }
  }

  acceptTrade(offerId) {
    try {
      this.app.executeHumanAction({
        type: 'ACCEPT_TRADE',
        playerId: this.humanPlayerId,
        offerId: offerId
      });
      this.addEventLogItem('✅ Trade accepted!');
    } catch (error) {
      this.addEventLogItem(`❌ Trade acceptance failed: ${error.message}`);
    }
  }

  cancelTrade(offerId) {
    try {
      this.app.executeHumanAction({
        type: 'CANCEL_TRADE',
        playerId: this.humanPlayerId,
        offerId: offerId
      });
      this.addEventLogItem('Trade cancelled');
    } catch (error) {
      this.addEventLogItem(`❌ Trade cancellation failed: ${error.message}`);
    }
  }

  showPlayerHand(targetPlayerId, hand) {
    const playerName = this.getPlayerName(targetPlayerId);
    const cardList = hand.map(card => `${card.color}`).join(', ');
    const colorCounts = {};
    hand.forEach(card => {
      colorCounts[card.color] = (colorCounts[card.color] || 0) + 1;
    });
    const summary = Object.entries(colorCounts)
      .map(([color, count]) => `${count}× ${color}`)
      .join(', ');

    alert(`👀 ${playerName}'s Hand:\n\n${summary}\n\nCards: ${cardList}`);
    this.addEventLogItem(`👀 Viewed ${playerName}'s hand: ${summary}`);
  }

  cleanup() {
    // Clean up event listeners
    console.log('Cleaning up UI...');
  }
}
