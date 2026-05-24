import type {
  ActionCard,
  AuctionState,
  GameLogEntry,
  GameState,
  PlayerId,
  PlayerPrivate,
  StockCard
} from '@insider-trading/shared';
import type { MutationResult } from '../domain/mutate.js';
import { adjust } from '../domain/prices.js';
import { event } from './events.js';
import { hasAnyPendingPrompt, setPrompt } from './prompts.js';
import {
  currentPlayer,
  describeCard,
  findPlayer,
  payBank,
  refillMarketIfNeeded,
  resolveStockSpecialOnBuy
} from './turn.js';

/** Start a new auction by the current player on a market card at `initialBid`. */
export function startAuction(
  state: GameState,
  playerId: PlayerId,
  cardUid: string,
  initialBid: number
): MutationResult {
  const events: GameLogEntry[] = [];
  if (state.gameOver) return { ok: false, error: 'game is over', events };
  if (state.turnPhase !== 'awaiting_turn_action') {
    return { ok: false, error: `cannot start auction in phase ${state.turnPhase}`, events };
  }
  if (hasAnyPendingPrompt(state)) {
    return { ok: false, error: 'pending prompts must resolve first', events };
  }
  const player = currentPlayer(state);
  if (player.playerId !== playerId) return { ok: false, error: `not ${playerId}'s turn`, events };
  if (initialBid < 0 || !Number.isInteger(initialBid)) {
    return { ok: false, error: 'initialBid must be a non-negative integer', events };
  }
  const cardIdx = state.market.findIndex(c => c.uid === cardUid);
  if (cardIdx < 0) return { ok: false, error: 'card not in market', events };

  // Build active bidders list in turn order. Once the auctioneer is outbid
  // they're a regular bidder, so include them at the END (the rotation begins
  // at auctioneer+1; auctioneer wraps around last).
  const n = state.players.length;
  const order: PlayerId[] = [];
  for (let i = 1; i < n; i++) {
    order.push(state.players[(state.currentPlayerIndex + i) % n].playerId);
  }
  order.push(playerId);
  const auction: AuctionState = {
    cardUid,
    auctioneerId: playerId,
    initialBid,
    currentHigh: initialBid,
    currentHighBidderId: playerId,
    activeBidders: order,
    awaitingBidderId: order[0] ?? null
  };
  state.auction = auction;
  state.turnPhase = 'in_auction';
  events.push(
    event('auction_started', `${player.name} starts an auction for ${describeCard(state.market[cardIdx])} at $${initialBid}`, {
      actor: playerId,
      payload: { cardUid, initialBid, order }
    })
  );

  // Set the first bid prompt (or resolve immediately if no one else can bid).
  if (auction.awaitingBidderId) {
    promptForBid(state, auction);
  } else {
    resolveAuction(state, events);
  }
  return { ok: true, events };
}

function promptForBid(state: GameState, auction: AuctionState): void {
  if (!auction.awaitingBidderId) return;
  const bidder = findPlayer(state, auction.awaitingBidderId);
  setPrompt(
    state,
    bidder.playerId,
    'auction_bid',
    `Auction: current high $${auction.currentHigh} by ${state.players.find(p => p.playerId === auction.currentHighBidderId)?.name}. Bid or pass?`,
    {
      cardUid: auction.cardUid,
      currentHigh: auction.currentHigh,
      currentHighBidderId: auction.currentHighBidderId,
      mustBeatBy: 1
    }
  );
}

export function bid(state: GameState, playerId: PlayerId, amount: number): MutationResult {
  const events: GameLogEntry[] = [];
  if (state.gameOver) return { ok: false, error: 'game is over', events };
  if (!state.auction) return { ok: false, error: 'no active auction', events };
  if (state.auction.awaitingBidderId !== playerId) {
    return { ok: false, error: 'not your turn to bid', events };
  }
  if (!Number.isInteger(amount) || amount < 0) {
    return { ok: false, error: 'amount must be a non-negative integer', events };
  }
  const auction = state.auction;
  // Preferred Bidder tie-break: ties allowed if bidder holds Preferred Bidder.
  const bidder = findPlayer(state, playerId);
  const hasPreferred = bidder.persistentEffects.some(
    e => e.effect.type === 'tie_breaker'
  );
  if (amount < auction.currentHigh) {
    return { ok: false, error: 'bid must be >= current high', events };
  }
  if (amount === auction.currentHigh && !hasPreferred) {
    return { ok: false, error: 'bid must beat current high', events };
  }
  // Accept the bid.
  auction.currentHigh = amount;
  auction.currentHighBidderId = playerId;
  // Player remains in activeBidders (could be outbid and re-bid), but rotate.
  state.pendingPrompts[playerId] = null;
  events.push(
    event('auction_bid', `${bidder.name} bids $${amount}`, {
      actor: playerId,
      payload: { amount }
    })
  );
  advanceAuction(state, events);
  return { ok: true, events };
}

export function pass(state: GameState, playerId: PlayerId): MutationResult {
  const events: GameLogEntry[] = [];
  if (state.gameOver) return { ok: false, error: 'game is over', events };
  if (!state.auction) return { ok: false, error: 'no active auction', events };
  if (state.auction.awaitingBidderId !== playerId) {
    return { ok: false, error: 'not your turn to bid', events };
  }
  const auction = state.auction;
  auction.activeBidders = auction.activeBidders.filter(id => id !== playerId);
  state.pendingPrompts[playerId] = null;
  events.push(
    event('auction_pass', `${findPlayer(state, playerId).name} passes`, { actor: playerId })
  );
  advanceAuction(state, events);
  return { ok: true, events };
}

/**
 * After a bid or pass, decide what's next:
 *  - If only the current high bidder remains active (and they're not in the
 *    activeBidders list either because they're the auctioneer or because
 *    everyone else passed), resolve.
 *  - Otherwise rotate `awaitingBidderId` to the next active bidder who is not
 *    currently the high bidder.
 */
function advanceAuction(state: GameState, events: GameLogEntry[]): void {
  const a = state.auction!;
  // Next bidder = next in activeBidders order who is not the current high bidder.
  const next = a.activeBidders.find(id => id !== a.currentHighBidderId);
  if (!next) {
    // Auction over.
    resolveAuction(state, events);
    return;
  }
  a.awaitingBidderId = next;
  promptForBid(state, a);
}

function resolveAuction(state: GameState, events: GameLogEntry[]): void {
  const a = state.auction;
  if (!a) return;
  const winner = findPlayer(state, a.currentHighBidderId);
  const cardIdx = state.market.findIndex(c => c.uid === a.cardUid);
  if (cardIdx < 0) {
    state.auction = null;
    state.turnPhase = 'awaiting_die_roll';
    return;
  }
  const card = state.market.splice(cardIdx, 1)[0];
  payBank(winner, a.currentHigh, events);
  winner.hand.push(card);
  events.push(
    event(
      'auction_resolved',
      `${winner.name} wins ${describeCard(card)} at $${a.currentHigh}`,
      { actor: winner.playerId, payload: { cardUid: card.uid, finalBid: a.currentHigh } }
    )
  );
  // Color +1 if stock, then special.
  if (card.category === 'stock') {
    if (card.color !== 'Wild') {
      adjust(state.stockPrices, card.color, 1);
      events.push(
        event(
          'stock_purchase_rise',
          `${card.color} rises +1 to $${state.stockPrices[card.color]}`,
          { payload: { color: card.color, newPrice: state.stockPrices[card.color] } }
        )
      );
    }
    resolveStockSpecialOnBuy(state, winner, card as StockCard, events);
  }
  state.auction = null;
  refillMarketIfNeeded(state, events);
  state.turnPhase = 'awaiting_die_roll';
}
