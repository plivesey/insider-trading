/**
 * Unit tests for ConservativeAI
 */
import { describe, test, expect, beforeEach } from '@jest/globals';
import { ConservativeAI } from '../../../web/ai/ConservativeAI.js';
import { createPlayer, createResourceCard, createGoalCard, createStockPrices } from '../../helpers/builders.js';
import { PHASES, ACTION_TYPES, COLORS } from '../../../src/utils/Constants.js';

describe('ConservativeAI', () => {
  let ai;
  let state;

  beforeEach(() => {
    ai = new ConservativeAI('ai-conservative', 'Conservative Carl');

    // Create basic game state
    state = {
      currentPhase: PHASES.AUCTION,
      currentRound: 1,
      stockPrices: createStockPrices(4),
      players: [
        createPlayer({
          id: 'ai-conservative',
          name: 'Conservative Carl',
          cash: 5,
          hand: [
            createResourceCard('Blue'),
            createResourceCard('Blue')
          ],
          goalCards: [
            createGoalCard({
              stockChange: {
                text: 'Blue +1',
                parsed: { Blue: 1 },
                type: 'single_up'
              },
              goal: {
                text: '2 Blue',
                parsed: {
                  type: 'pair',
                  requirements: { Blue: 2 }
                }
              },
              reward: {
                text: 'Gain $1',
                parsed: {
                  type: 'gain_cash',
                  amount: 1,
                  requiresTarget: false,
                  requiresChoice: false,
                  value: 1
                }
              },
              metadata: {
                goalParsed: {
                  type: 'pair',
                  requirements: { Blue: 2 }
                },
                rewardParsed: {
                  type: 'gain_cash',
                  amount: 1,
                  requiresTarget: false,
                  requiresChoice: false,
                  value: 1
                }
              }
            })
          ]
        }),
        createPlayer({
          id: 'player2',
          name: 'Player 2',
          cash: 5,
          hand: [createResourceCard('Orange')],
          goalCards: []
        }),
        createPlayer({
          id: 'player3',
          name: 'Player 3',
          cash: 5,
          hand: [createResourceCard('Yellow')],
          goalCards: []
        })
      ],
      turnOrder: ['ai-conservative', 'player2', 'player3'],
      phaseState: {}
    };
  });

  describe('constructor', () => {
    test('should initialize with conservative parameters', () => {
      expect(ai.playerId).toBe('ai-conservative');
      expect(ai.name).toBe('Conservative Carl');
      expect(ai.maxSpendRatio).toBe(0.5);
      expect(ai.profitMargin).toBe(1);
      expect(ai.maxTradesPerPhase).toBe(2);
    });
  });

  describe('Auction Phase', () => {
    beforeEach(() => {
      state.currentPhase = PHASES.AUCTION;
      state.phaseState.auction = {
        currentCard: createResourceCard('Blue'),
        currentBid: 2,
        currentBidder: 'player2',
        activeBidders: new Set(['ai-conservative', 'player2', 'player3'])
      };
    });

    test('should bid on goal-relevant cards', () => {
      // Give AI more cash to allow bidding
      state.players[0].cash = 10;

      const action = ai.decideAuction(null, state);

      expect(action.type).toBe(ACTION_TYPES.PLACE_BID);
      expect(action.playerId).toBe('ai-conservative');
      expect(action.amount).toBe(3); // Current bid + 1
    });

    test('should never bid more than 50% of cash', () => {
      state.phaseState.auction.currentBid = 0;
      state.players[0].cash = 10;

      const action = ai.decideAuction(null, state);

      if (action.type === ACTION_TYPES.PLACE_BID) {
        expect(action.amount).toBeLessThanOrEqual(5); // 50% of 10
      }
    });

    test('should pass on cards that do not help with goals', () => {
      // Change current card to one not needed
      state.phaseState.auction.currentCard = createResourceCard('Purple');
      state.phaseState.auction.currentBid = 3;

      const action = ai.decideAuction(null, state);

      expect(action.type).toBe(ACTION_TYPES.PASS);
    });

    test('should pass if already passed (not in active bidders)', () => {
      state.phaseState.auction.activeBidders = new Set(['player2', 'player3']);

      const action = ai.decideAuction(null, state);

      expect(action.type).toBe(ACTION_TYPES.PASS);
    });

    test('should pass if cannot afford', () => {
      state.players[0].cash = 2;
      state.phaseState.auction.currentBid = 3;

      const action = ai.decideAuction(null, state);

      expect(action.type).toBe(ACTION_TYPES.PASS);
    });
  });

  describe('Trading Phase', () => {
    beforeEach(() => {
      state.currentPhase = PHASES.TRADING;
      state.phaseState.trading = {
        activeOffers: []
      };
      ai.tradeProposalCount = 0;
    });

    test('should accept profitable trades', () => {
      // Create a profitable offer for AI
      state.phaseState.trading.activeOffers = [
        {
          offerId: 'offer-1',
          offeringPlayer: 'player2',
          offering: {
            cards: [createResourceCard('Orange')],
            cash: 2
          },
          requesting: {
            cards: [{ color: 'Blue', count: 1 }],
            cash: 0
          }
        }
      ];

      // AI has Blue cards, can accept
      const action = ai.decideTrading(null, state);

      expect(action.type).toBe(ACTION_TYPES.ACCEPT_TRADE);
      expect(action.offerId).toBe('offer-1');
    });

    test('should reject unprofitable trades', () => {
      // Create an unprofitable offer (not enough value)
      state.phaseState.trading.activeOffers = [
        {
          offerId: 'offer-1',
          offeringPlayer: 'player2',
          offering: {
            cards: [],
            cash: 1
          },
          requesting: {
            cards: [{ color: 'Blue', count: 1 }],
            cash: 0
          }
        }
      ];

      const action = ai.decideTrading(null, state);

      // Should not accept (trade value too low)
      expect(action.type).toBe(ACTION_TYPES.END_TRADING);
    });

    test('should propose trades to complete goals', () => {
      // AI needs Orange to complete a goal
      state.players[0].goalCards = [
        createGoalCard({
          goal: {
            text: '2 Blue + 1 Orange',
            parsed: {
              type: 'pair_plus_specific',
              requirements: { Blue: 2, Orange: 1 }
            }
          },
          metadata: {
            goalParsed: {
              type: 'pair_plus_specific',
              requirements: { Blue: 2, Orange: 1 }
            },
            rewardParsed: {
              type: 'gain_cash',
              amount: 2,
              requiresTarget: false,
              requiresChoice: false,
              value: 2
            }
          }
        })
      ];

      // Give AI some duplicate cards to offer
      state.players[0].hand = [
        createResourceCard('Blue'),
        createResourceCard('Blue'),
        createResourceCard('Yellow'),
        createResourceCard('Yellow'),
        createResourceCard('Yellow')
      ];

      const action = ai.decideTrading(null, state);

      expect(action.type).toBe(ACTION_TYPES.PROPOSE_TRADE);
      expect(action.playerId).toBe('ai-conservative');
    });

    test('should not propose more than maxTradesPerPhase', () => {
      ai.tradeProposalCount = 2; // Already at limit

      const action = ai.decideTrading(null, state);

      expect(action.type).toBe(ACTION_TYPES.END_TRADING);
    });

    test('should end trading if no good offers and no trades to propose', () => {
      const action = ai.decideTrading(null, state);

      expect(action.type).toBe(ACTION_TYPES.END_TRADING);
    });
  });

  describe('Goal Resolution Phase', () => {
    beforeEach(() => {
      state.currentPhase = PHASES.GOAL_RESOLUTION;
      state.phaseState.goalResolution = {
        currentPlayerIndex: 0, // AI's turn
        pendingRewardExecution: null,
        revealedGoals: []
      };
    });

    test('should reveal completed goals first', () => {
      // AI has 2 Blue cards and a goal requiring 2 Blue
      const action = ai.decideGoal(null, state);

      expect(action.type).toBe(ACTION_TYPES.REVEAL_GOAL);
      expect(action.playerId).toBe('ai-conservative');
      expect(action.goalCardId).toBeDefined();
    });

    test('should select goal with highest score', () => {
      // Add multiple goals
      state.players[0].goalCards = [
        createGoalCard({
          id: 'goal-1',
          goal: {
            text: '2 Blue',
            parsed: { type: 'pair', requirements: { Blue: 2 } }
          },
          metadata: {
            goalParsed: { type: 'pair', requirements: { Blue: 2 } },
            rewardParsed: { type: 'gain_cash', amount: 1, value: 1 }
          }
        }),
        createGoalCard({
          id: 'goal-2',
          goal: {
            text: '0 Purple',
            parsed: { type: 'none_of', avoidColor: 'Purple' }
          },
          metadata: {
            goalParsed: { type: 'none_of', requirements: {}, avoidColor: 'Purple' },
            rewardParsed: { type: 'gain_cash', amount: 2, value: 2 }
          }
        })
      ];

      const action = ai.decideGoal(null, state);

      // Should prefer goal-1 (completed) over goal-2
      expect(action.type).toBe(ACTION_TYPES.REVEAL_GOAL);
      expect(action.goalCardId).toBe('goal-1');
    });

    test('should execute rewards with appropriate choices', () => {
      state.phaseState.goalResolution.pendingRewardExecution = {
        playerId: 'ai-conservative',
        goalCard: createGoalCard({
          reward: {
            text: 'Steal $1 from another player',
            parsed: {
              type: 'steal_cash',
              amount: 1,
              requiresTarget: true,
              requiresChoice: false,
              value: 2
            }
          },
          metadata: {
            rewardParsed: {
              type: 'steal_cash',
              amount: 1,
              requiresTarget: true,
              requiresChoice: false,
              value: 2
            }
          }
        })
      };

      // Make player2 richest
      state.players[1].cash = 10;

      const action = ai.executeReward(state.phaseState.goalResolution.pendingRewardExecution, state);

      expect(action.type).toBe(ACTION_TYPES.EXECUTE_REWARD);
      expect(action.choices.targetPlayerId).toBe('player2'); // Richest player
    });
  });

  describe('Sell Phase', () => {
    beforeEach(() => {
      state.currentPhase = PHASES.SELL;
      state.phaseState.sell = {
        playerSelections: {}
      };
    });

    test('should keep cards needed for goals', () => {
      // AI has goal requiring 2 Blue, currently has 2 Blue
      const action = ai.decideSell(null, state);

      expect(action.type).toBe(ACTION_TYPES.SELECT_CARDS_TO_SELL);

      const selectedCards = state.players[0].hand.filter(c =>
        action.cardIds.includes(c.id)
      );

      // Should not sell Blue cards (needed for goal)
      expect(selectedCards.every(c => c.color !== 'Blue')).toBe(true);
    });

    test('should sell duplicate cards (3+ of same color)', () => {
      // Give AI many duplicate cards
      state.players[0].hand = [
        createResourceCard('Yellow'),
        createResourceCard('Yellow'),
        createResourceCard('Yellow'),
        createResourceCard('Yellow')
      ];

      // No goal requires Yellow
      state.players[0].goalCards = [];

      const action = ai.decideSell(null, state);

      expect(action.type).toBe(ACTION_TYPES.SELECT_CARDS_TO_SELL);
      expect(action.cardIds.length).toBeGreaterThan(0);
    });

    test('should commit after selecting', () => {
      // Set up as if cards already selected
      state.phaseState.sell.playerSelections['ai-conservative'] = {
        cardsToSell: ['card-1'],
        committed: false
      };

      const action = ai.decideSell(null, state);

      expect(action.type).toBe(ACTION_TYPES.COMMIT_SELL);
    });

    test('should return null if already committed', () => {
      state.phaseState.sell.playerSelections['ai-conservative'] = {
        cardsToSell: ['card-1'],
        committed: true
      };

      const action = ai.decideSell(null, state);

      expect(action).toBeNull();
    });
  });

  describe('Helper Methods', () => {
    test('evaluateCardValue should factor in goal synergy', () => {
      const value = ai.evaluateCardValue('Blue', state);

      // Blue is needed for goal, should have synergy bonus
      expect(value).toBeGreaterThan(state.stockPrices.Blue);
    });

    test('calculateGoalSynergy should give bonus for completing goals', () => {
      // AI has 1 Blue, needs 1 more to complete goal
      state.players[0].hand = [createResourceCard('Blue')];

      const synergy = ai.calculateGoalSynergy('Blue', state);

      expect(synergy).toBe(2); // Completes goal
    });

    test('calculateGoalSynergy should give penalty for avoid colors', () => {
      state.players[0].goalCards = [
        createGoalCard({
          goal: {
            text: '0 Purple',
            parsed: { type: 'none_of', avoidColor: 'Purple' }
          },
          metadata: {
            goalParsed: { type: 'none_of', requirements: {}, avoidColor: 'Purple' }
          }
        })
      ];

      const synergy = ai.calculateGoalSynergy('Purple', state);

      expect(synergy).toBeLessThan(0); // Penalty
    });

    test('getNeededCards should return cards needed for goals', () => {
      state.players[0].hand = [createResourceCard('Blue')];
      state.players[0].goalCards = [
        createGoalCard({
          goal: {
            text: '2 Blue + 1 Orange',
            parsed: {
              type: 'pair_plus_specific',
              requirements: { Blue: 2, Orange: 1 }
            }
          },
          metadata: {
            goalParsed: {
              type: 'pair_plus_specific',
              requirements: { Blue: 2, Orange: 1 }
            }
          }
        })
      ];

      const needed = ai.getNeededCards(state);

      expect(needed.Blue).toBe(1); // Need 1 more Blue
      expect(needed.Orange).toBe(1); // Need 1 Orange
    });
  });
});
