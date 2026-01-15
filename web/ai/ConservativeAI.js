/**
 * ConservativeAI - Easier AI opponent
 * Strategy: Risk-averse, goal-focused, simple valuations
 * - Only bids on cards that help with goals
 * - Never spends more than 50% of cash
 * - Requires profitable trades (value_received > value_given + $1)
 * - Prioritizes completing goals over market manipulation
 */
import { BaseAI } from './BaseAI.js';
import { ACTION_TYPES, COLORS, REWARD_TYPES } from '../../src/utils/Constants.js';

export class ConservativeAI extends BaseAI {
  constructor(playerId, name = 'Conservative AI') {
    super(playerId, name);
    this.maxSpendRatio = 0.5;  // Never spend more than 50% of cash
    this.profitMargin = 1;     // Require $1 profit on trades
    this.maxTradesPerPhase = 2; // Limited trade proposals
    this.tradeProposalCount = 0;
  }

  /**
   * Auction Phase: Bid conservatively on goal-relevant cards
   */
  decideAuction(engine, state) {
    const myPlayer = this.getMyPlayer(state);
    const auction = state.phaseState.auction;
    const currentCard = auction.currentCard;
    const currentBid = auction.currentBid;
    const activeBidders = auction.activeBidders;

    // Check if I can still bid (haven't passed)
    if (!activeBidders || !activeBidders.has(this.playerId)) {
      return { type: ACTION_TYPES.PASS, playerId: this.playerId };
    }

    // Evaluate card value
    const cardValue = this.evaluateCardForAuction(currentCard.color, state);
    const nextBid = currentBid + 1;
    const maxBid = Math.min(
      Math.floor(myPlayer.cash * this.maxSpendRatio),
      Math.floor(cardValue)
    );

    // Decide whether to bid: can afford next bid and card is valuable enough
    if (nextBid <= maxBid && nextBid <= myPlayer.cash && cardValue > currentBid) {
      return {
        type: ACTION_TYPES.PLACE_BID,
        playerId: this.playerId,
        amount: nextBid
      };
    }

    // Pass if card not valuable enough or can't afford
    return { type: ACTION_TYPES.PASS, playerId: this.playerId };
  }

  /**
   * Evaluate card value for auction (conservative: only goal-relevant cards)
   */
  evaluateCardForAuction(color, state) {
    const baseValue = state.stockPrices[color];
    const goalSynergy = this.calculateGoalSynergy(color, state);

    // Conservative: only bid if card helps with goals (or doesn't hurt)
    if (goalSynergy < 0) {
      return 0; // Avoid this card
    }

    if (goalSynergy === 0) {
      return baseValue * 0.5; // Low interest, but might buy if cheap
    }

    return baseValue + goalSynergy;
  }

  /**
   * Trading Phase: Propose trades to complete goals, accept profitable trades
   */
  decideTrading(engine, state) {
    const trading = state.phaseState.trading;
    const activeOffers = trading.activeOffers || [];

    // Reset trade count at start of trading phase
    if (this.tradeProposalCount === undefined) {
      this.tradeProposalCount = 0;
    }

    // First, check if there are any good trades to accept
    for (const offer of activeOffers) {
      // Can't accept own trades
      if (offer.offeringPlayer === this.playerId) continue;

      console.log(`[${this.name}] Evaluating trade from ${offer.offeringPlayer}:`, {
        offering: offer.offering,
        requesting: offer.requesting
      });

      // Check if this trade is for me (I have what they want)
      const canAccept = this.canAcceptTrade(offer, state);
      console.log(`[${this.name}] Can accept trade: ${canAccept}`);

      if (canAccept) {
        const tradeValue = this.evaluateTrade(offer, state);
        console.log(`[${this.name}] Trade value: $${tradeValue.toFixed(2)} (positive = good for me)`);

        // Accept any trade with positive expected value
        if (tradeValue > 0) {
          console.log(`[${this.name}] ✅ ACCEPTING trade! Expected gain: $${tradeValue.toFixed(2)}`);
          return {
            type: ACTION_TYPES.ACCEPT_TRADE,
            playerId: this.playerId,
            offerId: offer.offerId
          };
        } else {
          console.log(`[${this.name}] ❌ DECLINING trade. Would lose $${Math.abs(tradeValue).toFixed(2)}`);
          // Store decline info for logging
          this.lastTradeDecline = {
            offerId: offer.offerId,
            offeringPlayer: offer.offeringPlayer,
            reason: 'unprofitable'
          };
        }
      } else {
        console.log(`[${this.name}] ❌ Cannot accept trade (don't have requested resources)`);
        this.lastTradeDecline = {
          offerId: offer.offerId,
          offeringPlayer: offer.offeringPlayer,
          reason: 'cannot_fulfill'
        };
      }
    }

    // Try to propose a trade if under limit
    if (this.tradeProposalCount < this.maxTradesPerPhase) {
      const trade = this.createTradeProposal(state);
      if (trade) {
        this.tradeProposalCount++;
        return trade;
      }
    }

    // End trading phase (conservative: don't wait)
    return {
      type: ACTION_TYPES.END_TRADING,
      playerId: this.playerId
    };
  }

  /**
   * Check if AI can accept a trade (has requested resources)
   */
  canAcceptTrade(offer, state) {
    const myPlayer = this.getMyPlayer(state);

    // Check if I have the cards they want
    if (offer.requesting.cards) {
      for (const request of offer.requesting.cards) {
        const have = this.getCardCountByColor(myPlayer.hand, request.color);
        if (have < request.count) {
          return false;
        }
      }
    }

    // Check if I have the cash they want
    if (offer.requesting.cash > myPlayer.cash) {
      return false;
    }

    return true;
  }

  /**
   * Create a trade proposal to help complete goals
   */
  createTradeProposal(state) {
    const myPlayer = this.getMyPlayer(state);
    const neededCards = this.getNeededCards(state);

    // Find cards I need
    const priorityNeeds = Object.entries(neededCards)
      .filter(([color, priority]) => priority > 0)
      .sort((a, b) => b[1] - a[1]);

    if (priorityNeeds.length === 0) {
      return null; // No cards needed
    }

    // Request most needed card
    const [requestColor] = priorityNeeds[0];
    const requestValue = this.calculateExpectedValue(requestColor, state);

    // Offer: cards I don't need or cash
    const offering = { cards: [], cash: 0 };

    // Find cards to offer (prioritize cards with lower expected value)
    const cardsByColor = {};
    for (const card of myPlayer.hand) {
      if (!cardsByColor[card.color]) {
        cardsByColor[card.color] = [];
      }
      cardsByColor[card.color].push(card);
    }

    // Calculate expected value for each color
    const colorValues = {};
    for (const color of Object.keys(cardsByColor)) {
      colorValues[color] = this.calculateExpectedValue(color, state);
    }

    // Find cards to offer: duplicates or cards I don't need for goals
    let offerValue = 0;
    const targetOfferValue = requestValue - 1; // Aim to gain $1

    for (const [color, cards] of Object.entries(cardsByColor)) {
      // Only offer cards if:
      // 1. I have duplicates (3+ of same color), OR
      // 2. I don't need this color for goals
      if (cards.length >= 3 || neededCards[color] <= 0) {
        offering.cards.push(cards[0]);
        offerValue += colorValues[color];

        // If we're offering enough value, stop
        if (offerValue >= targetOfferValue) {
          break;
        }
      }
    }

    // If we don't have enough cards to offer, add cash
    if (offerValue < targetOfferValue && myPlayer.cash >= 2) {
      const cashNeeded = Math.min(
        Math.ceil(targetOfferValue - offerValue),
        Math.floor(myPlayer.cash / 2) // Only offer up to half our cash
      );
      offering.cash = cashNeeded;
      offerValue += cashNeeded;
    }

    // Must offer something
    if (offering.cards.length === 0 && offering.cash === 0) {
      return null;
    }

    // Calculate net value for us (should be positive)
    const netValue = requestValue - offerValue;

    // Only propose if we benefit by at least $1
    if (netValue < 1) {
      return null;
    }

    // Create trade proposal
    return {
      type: ACTION_TYPES.PROPOSE_TRADE,
      playerId: this.playerId,
      offering,
      requesting: {
        cards: [{ color: requestColor, count: 1 }],
        cash: 0
      }
    };
  }

  /**
   * Goal Resolution Phase: Reveal best goal
   */
  decideGoal(engine, state) {
    const goalResolution = state.phaseState.goalResolution;
    const myPlayer = this.getMyPlayer(state);

    // Check if it's my turn
    const currentPlayerIndex = goalResolution.currentPlayerIndex;
    const currentPlayerId = state.turnOrder[currentPlayerIndex];

    if (currentPlayerId !== this.playerId) {
      return null; // Not my turn
    }

    // Check if I need to execute a reward
    if (goalResolution.pendingRewardExecution) {
      return this.executeReward(goalResolution.pendingRewardExecution, state);
    }

    // Reveal a goal
    const bestGoal = this.selectBestGoal(myPlayer.goalCards, myPlayer.hand, state);

    if (!bestGoal) {
      throw new Error('No goals available to reveal');
    }

    return {
      type: ACTION_TYPES.REVEAL_GOAL,
      playerId: this.playerId,
      goalCardId: bestGoal.id
    };
  }

  /**
   * Execute reward with choices
   */
  executeReward(pending, state) {
    const rewardType = pending.goalCard.metadata.rewardParsed.type;
    const myPlayer = this.getMyPlayer(state);

    const choices = {};

    switch (rewardType) {
      case REWARD_TYPES.STEAL_CASH:
      case REWARD_TYPES.LOOK_AT_HAND:
      case REWARD_TYPES.TAKE_AND_GIVE_CARD:
        // Select target player
        choices.targetPlayerId = this.selectTargetPlayer(rewardType, state);

        // For take_and_give, also select which card to give
        if (rewardType === REWARD_TYPES.TAKE_AND_GIVE_CARD) {
          // Give lowest value card
          const lowestCard = myPlayer.hand.reduce((lowest, card) =>
            state.stockPrices[card.color] < state.stockPrices[lowest.color] ? card : lowest
          );
          choices.cardIdToGive = lowestCard.id;
        }
        break;

      case REWARD_TYPES.ADJUST_STOCK:
        // Increase stock of cards in hand
        const colorCounts = {};
        for (const color of Object.values(COLORS)) {
          colorCounts[color] = this.getCardCountByColor(myPlayer.hand, color);
        }
        const mostHeld = Object.entries(colorCounts).reduce((max, [color, count]) =>
          count > max[1] ? [color, count] : max, ['Blue', 0]);

        choices.color = mostHeld[0];
        choices.direction = 1; // Increase
        break;

      case REWARD_TYPES.PEEK_AND_PLACE:
        // Place on bottom (conservative: don't manipulate too much)
        choices.placement = 'bottom';
        break;

      case REWARD_TYPES.SWAP_WITH_DECK:
        // Swap lowest value card
        const swapCard = myPlayer.hand.reduce((lowest, card) =>
          state.stockPrices[card.color] < state.stockPrices[lowest.color] ? card : lowest
        );
        choices.cardId = swapCard.id;
        break;

      case REWARD_TYPES.REARRANGE_TOP_5:
        // Simple: keep current order (too complex)
        // The system should provide current order
        // For now, just return first 5 card IDs from deck
        // This will be filled by the reward system
        choices.newOrder = []; // Placeholder
        break;

      case REWARD_TYPES.BUY_WITH_DISCOUNT:
        // Buy cheapest stock
        const cheapest = Object.entries(state.stockPrices).reduce((min, [color, price]) =>
          price < min[1] ? [color, price] : min, ['Blue', Infinity]);
        choices.color = cheapest[0];
        break;

      default:
        // No choices needed
        break;
    }

    return {
      type: ACTION_TYPES.EXECUTE_REWARD,
      playerId: this.playerId,
      choices
    };
  }

  /**
   * Sell Phase: Keep cards for goals, sell duplicates and low-value cards
   */
  decideSell(engine, state) {
    const sellState = state.phaseState.sell;
    const mySelection = sellState.playerSelections[this.playerId];
    const myPlayer = this.getMyPlayer(state);

    // If already committed, nothing to do
    if (mySelection && mySelection.committed) {
      return null;
    }

    // If no selection yet, select cards to sell
    if (!mySelection || !mySelection.cardsToSell) {
      const cardsToSell = this.selectCardsToSell(state);

      return {
        type: ACTION_TYPES.SELECT_CARDS_TO_SELL,
        playerId: this.playerId,
        cardIds: cardsToSell.map(c => c.id)
      };
    }

    // Commit sell
    return {
      type: ACTION_TYPES.COMMIT_SELL,
      playerId: this.playerId
    };
  }

  /**
   * Select which cards to sell (conservative: keep cards for goals)
   */
  selectCardsToSell(state) {
    const myPlayer = this.getMyPlayer(state);
    const toSell = [];

    // Count cards by color
    const cardsByColor = {};
    for (const card of myPlayer.hand) {
      if (!cardsByColor[card.color]) {
        cardsByColor[card.color] = [];
      }
      cardsByColor[card.color].push(card);
    }

    // Calculate how many of each color to KEEP for goals
    const colorsToKeep = {};
    for (const color of Object.values(COLORS)) {
      colorsToKeep[color] = 0;
    }

    // Check unrevealed goals to see what cards we need
    const unrevealedGoals = myPlayer.goalCards.filter(g => !g.revealed);
    for (const goal of unrevealedGoals) {
      const requirements = goal.metadata.goalParsed.requirements || {};
      const avoidColor = goal.metadata.goalParsed.avoidColor;

      // If this goal is met or close to being met, keep those cards
      if (this.isGoalMet(goal, myPlayer.hand)) {
        // Keep cards for this completed goal
        for (const [color, count] of Object.entries(requirements)) {
          colorsToKeep[color] = Math.max(colorsToKeep[color], count);
        }
      } else {
        // Keep cards we're working toward
        for (const [color, count] of Object.entries(requirements)) {
          const have = this.getCardCountByColor(myPlayer.hand, color);
          if (have < count) {
            // Still need more
            colorsToKeep[color] = Math.max(colorsToKeep[color], have);
          } else {
            // Have enough
            colorsToKeep[color] = Math.max(colorsToKeep[color], count);
          }
        }
      }

      // Mark avoid colors to sell
      if (avoidColor) {
        colorsToKeep[avoidColor] = -1; // Signal to sell all
      }
    }

    // Now decide what to sell
    for (const [color, cards] of Object.entries(cardsByColor)) {
      const keepCount = colorsToKeep[color];

      if (keepCount < 0) {
        // Avoid color: sell all
        toSell.push(...cards);
      } else {
        // Sell extras beyond what we need to keep
        const extras = cards.slice(keepCount);
        toSell.push(...extras);
      }
    }

    return toSell;
  }
}
