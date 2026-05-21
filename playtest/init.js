#!/usr/bin/env node
// Initializes a playtest game state for Insider Trading V3
// Usage: node playtest/init.js [numPlayers]
// Defaults to 3 players if not specified

const fs = require('fs');
const path = require('path');

// --- Load card data ---
const cardsDir = path.join(__dirname, '..', 'cards');
const stockCards = JSON.parse(fs.readFileSync(path.join(cardsDir, 'stock_cards.json'), 'utf8'));
const actionCards = JSON.parse(fs.readFileSync(path.join(cardsDir, 'action_cards.json'), 'utf8'));
const insiderTipCards = JSON.parse(fs.readFileSync(path.join(cardsDir, 'market_manipulation_cards.json'), 'utf8')).cards;
const goalCards = JSON.parse(fs.readFileSync(path.join(cardsDir, 'goal_cards.json'), 'utf8')).cards;
const crisisCards = JSON.parse(fs.readFileSync(path.join(cardsDir, 'crisis_cards.json'), 'utf8'));

// --- Fisher-Yates shuffle ---
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- Assign unique IDs to all cards ---
let nextId = 1;
function assignId(card, category) {
  return { ...card, uid: `${category}-${nextId++}` };
}

// Tag and ID stock cards
const taggedStocks = stockCards.map(c => assignId({ ...c, category: 'stock' }, 'stock'));
// Tag and ID action cards
const taggedActions = actionCards.map(c => assignId({ ...c, category: 'action' }, 'action'));
// Tag and ID crisis cards
const taggedCrisis = crisisCards.map(c => assignId({ ...c, category: 'crisis' }, 'crisis'));
// Tag and ID insider tip cards
const taggedInsiderTips = insiderTipCards.map(c => assignId({ ...c, category: 'insider_tip' }, 'itip'));
// Tag and ID goal cards
const taggedGoals = goalCards.map(c => assignId({ ...c, category: 'goal' }, 'goal'));

// --- Build and shuffle main deck (32 stock + 10 action + 2 crisis = 44) ---
const mainDeck = shuffle([...taggedStocks, ...taggedActions, ...taggedCrisis]);

// --- Determine player count ---
const numPlayers = parseInt(process.argv[2]) || 3;
const tipsPerPlayer = numPlayers <= 4 ? 2 : 1;
const trackerThreshold = 3 * numPlayers;
const numGoals = numPlayers + 2;

// --- Player configs (up to 6) ---
const playerConfigs = [
  { name: "Carnegie", personality: "value_estimator" },
  { name: "Vanderbilt", personality: "manipulator" },
  { name: "Morgan", personality: "goal_chaser" },
  { name: "Astor", personality: "goal_seeker" },
  { name: "Hearst", personality: "two_pair_strategist" },
  { name: "Rockefeller", personality: "aggressive" },
];

// --- Deal Insider Tip Action cards ---
const shuffledTips = shuffle(taggedInsiderTips);
const playerTips = [];
for (let i = 0; i < numPlayers; i++) {
  playerTips.push(shuffledTips.slice(i * tipsPerPlayer, (i + 1) * tipsPerPlayer));
}
const insiderTipDeck = shuffledTips.slice(numPlayers * tipsPerPlayer);

// --- Select goal cards (players + 2) ---
const shuffledGoals = shuffle(taggedGoals);
const activeGoals = shuffledGoals.slice(0, numGoals);

// --- Draw 5 face-up market cards, handling crisis ---
const deck = [...mainDeck]; // mutable copy
const market = [];
let trackerCount = 0;
const trackerPile = [];

while (market.length < 5 && deck.length > 0) {
  const card = deck.shift();
  if (card.category === 'crisis') {
    // Crisis: +1 tracker, removed to tracker pile, draw replacement
    trackerCount++;
    trackerPile.push(card);
    console.log(`Crisis card "${card.name}" revealed during setup! Tracker now at ${trackerCount}.`);
  } else {
    market.push(card);
  }
}

// --- Build game state ---
const gameState = {
  status: "in_progress",
  trackerCount,
  trackerThreshold,
  trackerPile,
  stockPrices: { Blue: 4, Orange: 4, Yellow: 4, Purple: 4 },
  currentPlayerIndex: 0,
  turnNumber: 1,
  players: playerConfigs.slice(0, numPlayers).map((cfg, i) => ({
    name: cfg.name,
    personality: cfg.personality,
    cash: 30,
    hand: [],
    insiderTipCards: playerTips[i],
    persistentEffects: [],
    endGameCashBonus: 0,
    goalsClaimed: []
  })),
  market,
  mainDeck: deck,
  discardPile: [],
  insiderTipDeck,
  activeGoals,
  log: [`Game initialized with ${numPlayers} players, ${deck.length} cards in deck, ${market.length} in market, tracker at ${trackerCount}/${trackerThreshold}.`]
};

// --- Write game state ---
const outPath = path.join(__dirname, 'game_state.json');
fs.writeFileSync(outPath, JSON.stringify(gameState, null, 2));
console.log(`Game state written to ${outPath}`);
console.log(`Players: ${numPlayers} | Deck: ${deck.length} cards | Market: ${market.length} cards | Tracker: ${trackerCount}/${trackerThreshold}`);
console.log(`Goals: ${activeGoals.map(g => g.goal.text).join(', ')}`);
console.log(`Insider Tip deck: ${insiderTipDeck.length} remaining`);
