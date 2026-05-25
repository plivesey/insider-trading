import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards, type GameState, type StockCard } from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { makeRng } from '../../src/domain/rng.js';
import { createBotProfile } from '../../src/bots/profile.js';
import {
  goalBumpPerStock,
  perceivedStockValue,
  perceivedWildShareValue,
  visibleCount
} from '../../src/bots/valuation.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');
const catalog = loadCards(CARDS_DIR);

function freshGame(seed = 1): GameState {
  return createGameState({
    catalog,
    players: [
      { playerId: 'a', name: 'A', isBot: true },
      { playerId: 'b', name: 'B', isBot: true }
    ],
    seed,
    gameId: 'g',
    startedAt: '2026-01-01T00:00:00.000Z'
  });
}

function neutralProfile() {
  // stockOffset=0, actionOffset=0, hotTipThreshold=0, wildShareValue=2
  const rng = makeRng(0);
  const p = createBotProfile(rng);
  p.stockOffset = 0;
  p.actionOffset = 0;
  p.hotTipThreshold = 0;
  p.wildShareValue = 2;
  p.knownPeekedTips = [];
  p.auctionCeilings = {};
  return p;
}

describe('bot valuation', () => {
  it('perceivedStockValue = basePrice + visibleCount + goalBump + offset', () => {
    const state = freshGame(1);
    const profile = neutralProfile();
    // Clear hands and market for a controlled scenario.
    state.players[0].hand = [];
    state.players[1].hand = [];
    state.market = [];
    state.activeGoals = [];
    state.stockPrices = { Blue: 5, Orange: 5, Yellow: 5, Purple: 5 };

    // No goals, no visible stocks → value = base price.
    expect(perceivedStockValue(state, profile, 'Yellow', 'a')).toBe(5);

    // Add two Yellow stocks to the market → +2 visible.
    const yellows = catalog.stocks.filter(s => s.color === 'Yellow').slice(0, 2);
    state.market.push(...yellows);
    expect(visibleCount(state, 'Yellow', 'a')).toBe(2);
    expect(perceivedStockValue(state, profile, 'Yellow', 'a')).toBe(7);

    // Apply a stockOffset of −1 → −1 to perceived value.
    profile.stockOffset = -1;
    expect(perceivedStockValue(state, profile, 'Yellow', 'a')).toBe(6);
  });

  it('goalBumpPerStock applies floor(reward / (total requirements + 3))', () => {
    const state = freshGame(2);
    state.activeGoals = [];
    // Inject a 2-Purple goal with a $5 cash reward.
    const pair = catalog.goals.find(
      g =>
        g.goal.parsed.type === 'pair' &&
        g.goal.parsed.requirements.Purple === 2 &&
        g.reward.parsed.type === 'gain_cash'
    );
    if (!pair) {
      // Synthesize one if catalog doesn't have it.
      state.activeGoals = [
        {
          category: 'goal',
          uid: 'g-fake',
          id: 999,
          difficulty: 'easy',
          goal: {
            text: '2 Purple',
            parsed: { type: 'pair', requirements: { Purple: 2 } }
          },
          reward: { text: '$5', parsed: { type: 'gain_cash', amount: 5 } }
        }
      ];
    } else {
      // Replace reward with a $5 cash reward for the assertion.
      state.activeGoals = [
        {
          ...pair,
          reward: { text: '$5', parsed: { type: 'gain_cash', amount: 5 } }
        }
      ];
    }
    expect(goalBumpPerStock(state, 'Purple', 'a')).toBe(1); // floor(5/(2+3)) = 1
    expect(goalBumpPerStock(state, 'Yellow', 'a')).toBe(0); // goal doesn't need Yellow
  });

  it('goalBumpPerStock returns 0 when the bot is >2 cards away from claiming', () => {
    const state = freshGame(7);
    // A 2B+2P goal: requires 4 cards. With an empty stock hand the bot needs
    // 4 cards — well beyond the 2-card "near completion" threshold.
    state.activeGoals = [
      {
        category: 'goal',
        uid: 'g-far',
        id: 996,
        difficulty: 'hard',
        goal: {
          text: '2 Blue + 2 Purple',
          parsed: { type: 'two_pair', requirements: { Blue: 2, Purple: 2 } }
        },
        reward: { text: '$10', parsed: { type: 'gain_cash', amount: 10 } }
      }
    ];
    // Empty stock hands so the gap is 4.
    state.players[0].hand = [];
    state.players[1].hand = [];
    expect(goalBumpPerStock(state, 'Blue', 'a')).toBe(0);
    // After picking up 2 Blue, gap drops to 2 — goal becomes relevant again.
    const blues = catalog.stocks.filter(s => s.color === 'Blue').slice(0, 2);
    state.players[0].hand = blues;
    expect(goalBumpPerStock(state, 'Purple', 'a')).toBe(1); // floor(10/(4+3)) = 1
  });

  it('perceivedStockValue drops when a known peeked tip will halve the color', () => {
    const state = freshGame(3);
    const profile = neutralProfile();
    state.players[0].hand = [];
    state.players[1].hand = [];
    state.market = [];
    state.activeGoals = [];
    state.stockPrices = { Blue: 5, Orange: 5, Yellow: 6, Purple: 5 };

    // Pretend the top tip halves Yellow.
    const halveTip = catalog.insiderTips.find(
      t => t.effect.type === 'halve' && (t.effect as any).color === 'Yellow'
    );
    if (!halveTip) throw new Error('catalog missing halve-Yellow tip');
    // Put it at the front of the deck and tell the bot it knows about it.
    state.insiderTipDeck = [halveTip, ...state.insiderTipDeck.filter(t => t.uid !== halveTip.uid)];
    profile.knownPeekedTips.push(halveTip);

    // Yellow basePrice should be floor(6/2)=3; no visible/goal/offset → value=3.
    expect(perceivedStockValue(state, profile, 'Yellow', 'a')).toBe(3);
  });

  it('Wild Share value is max(profile.wildShareValue, best goal bump)', () => {
    const state = freshGame(4);
    const profile = neutralProfile(); // wildShareValue = 2
    state.activeGoals = [
      {
        category: 'goal',
        uid: 'g-fake-purple',
        id: 998,
        difficulty: 'easy',
        goal: { text: '2 Purple', parsed: { type: 'pair', requirements: { Purple: 2 } } },
        reward: { text: '$10', parsed: { type: 'gain_cash', amount: 10 } }
      },
      {
        category: 'goal',
        uid: 'g-fake-yellow',
        id: 997,
        difficulty: 'easy',
        goal: { text: '3 Yellow', parsed: { type: 'three_of_a_kind', requirements: { Yellow: 3 } } },
        reward: { text: '$6', parsed: { type: 'gain_cash', amount: 6 } }
      }
    ];
    // 2-Purple goal gap=2 → bump = floor(10/5) = 2. 3-Yellow gap=3 → filtered.
    // max(profile.wildShareValue=2, bestBump=2) = 2.
    expect(perceivedWildShareValue(state, profile, 'a')).toBe(2);
    // If the goal bump beats the personal value, use the bump instead.
    profile.wildShareValue = 2;
    state.activeGoals[0].reward = { text: '$30', parsed: { type: 'gain_cash', amount: 30 } };
    // 2-Purple goal bump = floor(30/5) = 6 > wildShareValue.
    expect(perceivedWildShareValue(state, profile, 'a')).toBe(6);
  });
});
