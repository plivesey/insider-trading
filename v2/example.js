/**
 * Example usage of the Insider Trading Board Game Engine
 */
import { GameEngine, CardLoader } from './src/index.js';
import fs from 'fs/promises';

async function runExample() {
  console.log('=== Insider Trading Board Game - Example ===\n');

  // Load card decks
  console.log('Loading card decks...');
  const resourceCards = await CardLoader.loadFromFile('./resource_deck.json', 'resource');
  const goalCards = await CardLoader.loadFromFile('./goal_cards.json', 'goal');
  console.log(`Loaded ${resourceCards.length} resource cards and ${goalCards.length} goal cards\n`);

  // Create game engine
  const engine = new GameEngine();

  // Set up players
  const players = [
    { id: 'alice', name: 'Alice' },
    { id: 'bob', name: 'Bob' },
    { id: 'charlie', name: 'Charlie' }
  ];

  // Subscribe to game events
  engine.on('GAME_STARTED', () => {
    console.log('🎮 Game Started!');
  });

  engine.on('PHASE_CHANGED', ({ fromPhase, toPhase, round }) => {
    console.log(`\n📍 Phase changed: ${fromPhase || 'none'} → ${toPhase} (Round ${round})`);
  });

  engine.on('AUCTION_STARTED', ({ cardCount }) => {
    console.log(`🔨 Auction started with ${cardCount} cards`);
  });

  engine.on('CARD_REVEALED', ({ card, cardIndex }) => {
    console.log(`  Card ${cardIndex + 1}: ${card.color}`);
  });

  engine.on('BID_PLACED', ({ playerId, amount }) => {
    console.log(`  💰 ${playerId} bid $${amount}`);
  });

  engine.on('PLAYER_PASSED', ({ playerId }) => {
    console.log(`  ❌ ${playerId} passed`);
  });

  engine.on('AUCTION_WON', ({ playerId, card, amount }) => {
    console.log(`  ✅ ${playerId} won ${card.color} for $${amount}`);
  });

  engine.on('STOCK_PRICES_UPDATED', ({ changes, newPrices, reason }) => {
    console.log(`\n💹 Stock prices updated (${reason}):`);
    for (const [color, change] of Object.entries(changes)) {
      if (change !== 0) {
        const sign = change > 0 ? '+' : '';
        console.log(`  ${color}: $${newPrices[color]} (${sign}${change})`);
      }
    }
  });

  engine.on('GOAL_REVEALED', ({ playerId, goalCard }) => {
    console.log(`\n🎯 ${playerId} revealed goal: ${goalCard.goal}`);
    console.log(`   Stock change: ${goalCard.stockChange}`);
    console.log(`   Reward: ${goalCard.reward}`);
  });

  engine.on('GOAL_CHECKED', ({ playerId, goalMet }) => {
    if (goalMet) {
      console.log(`   ✅ Goal met!`);
    } else {
      console.log(`   ❌ Goal not met`);
    }
  });

  engine.on('GAME_ENDED', ({ winner, finalScores }) => {
    console.log('\n🏆 Game Over!');
    console.log(`\nWinner: ${winner.name} with $${winner.wealth}`);
    console.log('\nFinal Scores:');
    finalScores.forEach((score, index) => {
      console.log(`  ${index + 1}. ${score.name}: $${score.wealth} (Cash: $${score.cash}, Cards: $${score.cardValue})`);
    });
  });

  // Initialize and start game
  console.log('Initializing game...');
  await engine.initialize(players, resourceCards, goalCards);
  console.log(`Players: ${players.map(p => p.name).join(', ')}`);
  console.log(`Starting cash: $${engine.getState().config.startingCash}`);
  console.log(`Starting cards: ${engine.getState().config.startingResourceCards} resource, ${engine.getState().config.startingGoalCards} goal\n`);

  engine.start();

  // Example: Simulate first auction
  console.log('\n--- Simulating Auction Phase ---');

  const state = engine.getState();
  const auction = state.phaseState.auction;

  // Players bid on first card
  try {
    engine.executeAction({ type: 'PLACE_BID', playerId: 'alice', amount: 2 });
    engine.executeAction({ type: 'PLACE_BID', playerId: 'bob', amount: 3 });
    engine.executeAction({ type: 'PASS', playerId: 'charlie' });
    engine.executeAction({ type: 'PASS', playerId: 'alice' });
    // Bob wins with $3 bid
  } catch (error) {
    console.error('Error during auction:', error.message);
  }

  // Show current state
  console.log('\n--- Current Game State ---');
  const currentState = engine.getState();
  console.log(`Current Phase: ${currentState.currentPhase}`);
  console.log(`Current Round: ${currentState.currentRound}`);
  console.log('\nStock Prices:');
  for (const [color, price] of Object.entries(currentState.stockPrices)) {
    console.log(`  ${color}: $${price}`);
  }

  console.log('\nPlayers:');
  for (const player of currentState.players) {
    console.log(`  ${player.name}: $${player.cash}, ${player.hand.length} cards, ${player.goalCards.length} goals`);
  }

  console.log('\n=== Example Complete ===');
}

// Run the example
runExample().catch(console.error);
