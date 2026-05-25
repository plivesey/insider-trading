import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCards,
  type GameLogEntry,
  type GameState,
  type PlayerId,
  type StockCard,
  type ActionCard
} from '@insider-trading/shared';
import { createGameState } from '../src/domain/setup.js';
import { makeRng, type Rng } from '../src/domain/rng.js';
import { advance } from '../src/engine/advance.js';
import { bid, pass, startAuction } from '../src/engine/auction.js';
import { submitFreeAction } from '../src/engine/freeActions.js';
import { respondToPrompt } from '../src/engine/promptResponse.js';
import { sellStock } from '../src/engine/turn.js';
import { decideBotAction, type BotAction } from '../src/bots/decide.js';
import { createBotProfile, type BotProfile } from '../src/bots/profile.js';
import { perceivedCardValue, perceivedStockCardValue, perceivedStockValue } from '../src/bots/valuation.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../cards');
const catalog = loadCards(CARDS_DIR);

function findCardInGame(state: GameState, uid: string): StockCard | ActionCard | null {
  for (const c of state.market) if (c.uid === uid) return c;
  for (const p of state.players) {
    for (const c of p.hand) {
      if (c.uid === uid && (c.category === 'stock' || c.category === 'action')) {
        return c as StockCard | ActionCard;
      }
    }
  }
  return null;
}

function describeCard(card: StockCard | ActionCard): string {
  if (card.category === 'stock') {
    const sc = card as StockCard;
    const typeBit = sc.type === 'blank' || sc.type === 'wild' ? '' : `/${sc.type}`;
    return `${sc.color}${typeBit}`;
  }
  return (card as ActionCard).name;
}

function executeBotActionDirect(
  state: GameState,
  playerId: PlayerId,
  action: BotAction,
  events: GameLogEntry[]
): boolean {
  let result;
  switch (action.kind) {
    case 'turn_action':
      result =
        action.action.type === 'start_auction'
          ? startAuction(state, playerId, action.action.cardUid, action.action.initialBid)
          : sellStock(state, playerId, action.action.stockUid);
      break;
    case 'auction_bid':
      result =
        action.action.type === 'bid'
          ? bid(state, playerId, action.action.amount)
          : pass(state, playerId);
      break;
    case 'free_action':
      result = submitFreeAction(state, playerId, action.request);
      break;
    case 'prompt_response':
      result = respondToPrompt(state, playerId, action.promptId, action.response);
      break;
  }
  if (!result.ok) return false;
  events.push(...result.events);
  advance(state, events);
  return true;
}

interface AuctionRecord {
  turn: number;
  cardDesc: string;
  cardUid: string;
  auctioneer: string;
  initialBid: number;
  perceivedByAuctioneer: number;
  perceivedByOthers: Array<{ name: string; perceived: number; cash: number; loans: number }>;
  winner: string;
  winningPrice: number;
  bids: Array<{ name: string; amount: number | 'pass' }>;
  pricesBefore: Record<string, number>;
}

const seed = Number(process.argv[2] ?? 42);
const players = [
  { playerId: 'a', name: 'Astor', isBot: true },
  { playerId: 'r', name: 'Rockefeller', isBot: true },
  { playerId: 'm', name: 'Mellon', isBot: true }
];
const state = createGameState({
  catalog,
  players,
  seed,
  gameId: `g-${seed}`,
  startedAt: '2026-01-01T00:00:00.000Z'
});
const botRng = makeRng((seed * 2 + 1) | 0);
const profiles = new Map<PlayerId, BotProfile>();
for (const p of players) profiles.set(p.playerId, createBotProfile(botRng));

console.log(`=== SEED ${seed} ===`);
console.log('Profiles:');
for (const p of players) {
  const prof = profiles.get(p.playerId)!;
  console.log(
    `  ${p.name.padEnd(12)} stockOffset=${prof.stockOffset >= 0 ? '+' : ''}${prof.stockOffset}, actionOffset=${prof.actionOffset >= 0 ? '+' : ''}${prof.actionOffset}, hotTipThreshold=${prof.hotTipThreshold}`
  );
}
console.log('Active goals:');
for (const g of state.activeGoals) {
  const req = g.goal.parsed.requirements;
  const desc = Object.entries(req).map(([c, n]) => `${n}${c[0]}`).join('+');
  console.log(`  - ${desc} -> ${g.reward.parsed.type} (${JSON.stringify(g.reward.parsed)})`);
}

const auctionRecords: AuctionRecord[] = [];
let currentAuction: AuctionRecord | null = null;
const allEventsLog: GameLogEntry[] = [];
const turnPriceHistory: Array<{ turn: number; prices: Record<string, number> }> = [];
let lastLoggedTurn = -1;

const tickRng = makeRng((seed * 4 + 7) | 0);

let ticks = 0;
while (!state.gameOver && ticks < 10000) {
  ticks++;
  let acted = false;

  // Check if a new auction just started (state.auction present but we don't have a record)
  if (state.auction && (!currentAuction || currentAuction.cardUid !== state.auction.cardUid)) {
    const card = findCardInGame(state, state.auction.cardUid);
    if (card) {
      const auctioneer = state.players.find(p => p.playerId === state.auction!.auctioneerId)!;
      const perceiveds: Array<{ name: string; perceived: number; cash: number; loans: number }> = [];
      for (const p of state.players) {
        if (p.playerId === auctioneer.playerId) continue;
        const prof = profiles.get(p.playerId)!;
        perceiveds.push({
          name: p.name,
          perceived: perceivedCardValue(card, state, prof, p.playerId),
          cash: p.cash,
          loans: p.loans
        });
      }
      const aprof = profiles.get(auctioneer.playerId)!;
      currentAuction = {
        turn: state.turnNumber,
        cardDesc: describeCard(card),
        cardUid: state.auction.cardUid,
        auctioneer: auctioneer.name,
        initialBid: state.auction.initialBid,
        perceivedByAuctioneer: perceivedCardValue(card, state, aprof, auctioneer.playerId),
        perceivedByOthers: perceiveds,
        winner: '',
        winningPrice: 0,
        bids: [],
        pricesBefore: { ...state.stockPrices }
      };
    }
  }

  // Look at the latest events that auction generated since the previous tick
  // — we'll capture bid history via post-action events below.

  for (const player of state.players) {
    const profile = profiles.get(player.playerId);
    if (!profile) continue;
    const action = decideBotAction(state, player.playerId, profile, { rng: tickRng });
    if (!action) continue;
    const events: GameLogEntry[] = [];
    const ok = executeBotActionDirect(state, player.playerId, action, events);
    if (!ok) {
      console.log('invalid action by', player.name, JSON.stringify(action));
      process.exit(1);
    }
    allEventsLog.push(...events);
    if (state.turnNumber !== lastLoggedTurn) {
      turnPriceHistory.push({ turn: state.turnNumber, prices: { ...state.stockPrices } });
      lastLoggedTurn = state.turnNumber;
    }

    // Capture bid / pass events for the current auction
    if (currentAuction) {
      for (const e of events) {
        if (e.type === 'auction_bid') {
          const bidderName = state.players.find(p => p.playerId === e.actor)?.name ?? '?';
          const amount = (e.payload?.amount as number) ?? 0;
          currentAuction.bids.push({ name: bidderName, amount });
        } else if (e.type === 'auction_pass') {
          const bidderName = state.players.find(p => p.playerId === e.actor)?.name ?? '?';
          currentAuction.bids.push({ name: bidderName, amount: 'pass' });
        } else if (e.type === 'auction_resolved' || e.type === 'auction_completed' || e.type === 'auction_ended') {
          // detect resolution
        }
      }
    }

    // If auction is gone now, the auction resolved — finalize
    if (currentAuction && !state.auction) {
      const winnerName = (state.players.find(p => {
        // The winner just received the card. Their hand grew by 1.
        return p.hand.some(c => c.uid === currentAuction!.cardUid);
      }))?.name ?? currentAuction.auctioneer;
      // Winning price is highest bid (or initialBid if no bids)
      let winningPrice = currentAuction.initialBid;
      for (const b of currentAuction.bids) {
        if (typeof b.amount === 'number' && b.amount > winningPrice) winningPrice = b.amount;
      }
      currentAuction.winner = winnerName;
      currentAuction.winningPrice = winningPrice;
      auctionRecords.push(currentAuction);
      currentAuction = null;
    }

    acted = true;
    break;
  }
  if (!acted) {
    console.log('stuck');
    break;
  }
}

console.log(`\nGame ended after ${ticks} ticks. Reason: ${state.gameOver?.reason}, Turn: ${state.turnNumber}`);
console.log(`Final stock prices: ${JSON.stringify(state.stockPrices)}`);
console.log('\nFinal wealth breakdown:');
const sorted = [...state.gameOver!.breakdown].sort((a, b) => b.total - a.total);
for (const b of sorted) {
  const isWinner = state.gameOver!.winnerPlayerIds.includes(b.playerId);
  console.log(
    `  ${isWinner ? '👑' : '  '} ${b.name.padEnd(12)} total=$${String(b.total).padStart(3)}  ` +
      `(cash $${b.cash} + stocks $${b.stockValue} [${b.stocksHeld}] + bonus $${b.endGameBonus} − loans $${b.loanPenalty})`
  );
}

console.log('\n=== AUCTIONS ===');
for (const a of auctionRecords) {
  console.log(
    `T${a.turn} | ${a.auctioneer} -> ${a.cardDesc.padEnd(14)} | init=$${a.initialBid} | perceived(${a.auctioneer.slice(0,3)})=$${a.perceivedByAuctioneer}` +
      ` | others: ${a.perceivedByOthers.map(o => `${o.name.slice(0,3)}=$${o.perceived}(cash$${o.cash}${o.loans?`/L${o.loans}`:''})`).join(', ')}` +
      ` | bids: ${a.bids.map(b => `${b.name.slice(0,3)}:${b.amount}`).join(' ')}` +
      ` | WON BY ${a.winner} @ $${a.winningPrice}`
  );
}

// Compute per-player loss/gain on each card acquisition (price paid vs current stock price at end)
console.log('\n=== PER-PLAYER PURCHASE OUTCOMES ===');
const endPrices = state.stockPrices;
for (const p of state.players) {
  console.log(`\n${p.name}:`);
  let totalSpent = 0;
  let totalRecoveredOrHeld = 0;
  for (const a of auctionRecords) {
    if (a.winner !== p.name) continue;
    // Determine resulting recovery: is the card still in hand at endgame, or sold?
    // We look in this player's final hand:
    const stillHeld = p.hand.find(c => c.uid === a.cardUid);
    let outcome = '';
    if (stillHeld) {
      if (stillHeld.category === 'stock') {
        const sc = stillHeld as StockCard;
        const endPrice = sc.color === 'Wild' ? 0 : endPrices[sc.color];
        outcome = `held -> $${endPrice} at end`;
        totalRecoveredOrHeld += endPrice;
      } else {
        outcome = 'still in hand (action)';
      }
    } else {
      outcome = 'sold or consumed';
      // We don't know the sale price without scanning the log; approximate as 0 here
    }
    totalSpent += a.winningPrice;
    console.log(`  T${a.turn} bought ${a.cardDesc.padEnd(14)} for $${a.winningPrice} (perceived $${a.perceivedByAuctioneer === undefined ? '?' : a.perceivedByAuctioneer}, others-max $${Math.max(...a.perceivedByOthers.map(o=>o.perceived), 0)}) — ${outcome}`);
  }
  console.log(`  Subtotal: spent $${totalSpent} on auctions won; held-end-value $${totalRecoveredOrHeld}`);
}

// Sales and loans — collected from allEventsLog (we tracked above)
console.log('\n=== SALES, LOANS, GOAL CLAIMS, TIPS, ACTION CARDS ===');
const interesting = new Set([
  'sell_stock',
  'auto_loan',
  'goal_claimed',
  'insider_tip_resolved',
  'hot_tip_used',
  'action_card_played',
  'corner_the_market',
  'tip_off_resolved',
  'single_stock_adjust',
  'set_stock',
  'die_effect_all_up',
  'reward_cash',
  'reward_endgame_cash'
]);
for (const e of allEventsLog) {
  if (interesting.has(e.type)) {
    console.log(`T${String(e.turnNumber).padStart(2)} [${e.type.padEnd(22)}] ${e.message}`);
  }
}

// Stock price trajectory
console.log('\n=== STOCK PRICE HISTORY (per turn end) ===');
for (const tp of turnPriceHistory) {
  console.log(`T${String(tp.turn).padStart(2)} B=${tp.prices.Blue} O=${tp.prices.Orange} Y=${tp.prices.Yellow} P=${tp.prices.Purple}`);
}
