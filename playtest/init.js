#!/usr/bin/env node
// Initializes a playtest game state for Insider Trading V4
// Usage: node playtest/init.js [numPlayers]
// Defaults to 3 players if not specified

const fs = require('fs');
const path = require('path');

// --- Load card data ---
const cardsDir = path.join(__dirname, '..', 'cards');
const stockCards = JSON.parse(fs.readFileSync(path.join(cardsDir, 'stock_cards.json'), 'utf8'));
const actionCards = JSON.parse(fs.readFileSync(path.join(cardsDir, 'action_cards.json'), 'utf8'));
const insiderTipCards = JSON.parse(fs.readFileSync(path.join(cardsDir, 'insider_tip_cards.json'), 'utf8')).cards;
const goalCards = JSON.parse(fs.readFileSync(path.join(cardsDir, 'goal_cards.json'), 'utf8')).cards;

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

const taggedStocks = stockCards.map(c => assignId({ ...c, category: 'stock' }, 'stock'));
const taggedActions = actionCards.map(c => assignId({ ...c, category: 'action' }, 'action'));
const taggedInsiderTips = insiderTipCards.map(c => assignId({ ...c, category: 'insider_tip' }, 'itip'));
const taggedGoals = goalCards.map(c => assignId({ ...c, category: 'goal' }, 'goal'));

// --- Build and shuffle main deck (36 stock + 11 action = 47) ---
const mainDeck = shuffle([...taggedStocks, ...taggedActions]);

// --- Determine player count ---
const numPlayers = parseInt(process.argv[2]) || 3;
const numTips = 2 * numPlayers - 1;   // Insider Tip deck size (2 x players - 1)
const numGoals = numPlayers + 2;      // Goals displayed

// --- Player configs (up to 6) ---
const playerConfigs = [
  { name: "Astor", personality: "goal_seeker" },
  { name: "Getty", personality: "deal_hunter" },
  { name: "Morgan", personality: "goal_chaser" },
  { name: "Carnegie", personality: "value_estimator" },
  { name: "Vanderbilt", personality: "manipulator" },
  { name: "Hearst", personality: "two_pair_strategist" },
  { name: "Rockefeller", personality: "aggressive" },
];

// --- Build the Insider Tip deck (2 x players - 1, face-down) ---
const insiderTipDeck = shuffle(taggedInsiderTips).slice(0, numTips);

// --- Select goal cards (players + 2) ---
const activeGoals = shuffle(taggedGoals).slice(0, numGoals);

// --- Draw 5 face-up market cards (no crisis cards in V4) ---
const deck = [...mainDeck];
const market = deck.splice(0, 5);

// --- Build game state ---
const gameState = {
  version: 4,
  status: "in_progress",
  stockPrices: { Blue: 4, Orange: 4, Yellow: 4, Purple: 4 },
  currentPlayerIndex: 0,
  turnNumber: 1,
  players: playerConfigs.slice(0, numPlayers).map(cfg => ({
    name: cfg.name,
    personality: cfg.personality,
    cash: 30,
    hand: [],
    hotTipAvailable: true,
    persistentEffects: [],
    loans: 0,
    endGameCashBonus: 0,
    goalsClaimed: []
  })),
  market,
  mainDeck: deck,
  discardPile: [],
  insiderTipDeck,
  resolvedInsiderTips: [],
  activeGoals,
  loanCardsAvailable: 6,
  endConditions: {
    insiderTipDeckEmpty: false,
    oneGoalRemaining: false
  },
  log: [`Game initialized with ${numPlayers} players: ${deck.length} cards in main deck, ${market.length} in market, ${insiderTipDeck.length} Insider Tips, ${numGoals} goals.`]
};

// --- Write game state ---
const outPath = path.join(__dirname, 'game_state.json');
fs.writeFileSync(outPath, JSON.stringify(gameState, null, 2));
console.log(`Game state written to ${outPath}`);
console.log(`Players: ${numPlayers} | Main deck: ${deck.length} | Market: ${market.length} | Insider Tips: ${insiderTipDeck.length} | Goals: ${numGoals}`);
console.log(`Goals: ${activeGoals.map(g => g.goal.text).join(', ')}`);
console.log(`End conditions: Insider Tip deck exhausted, OR only 1 goal left in play.`);
