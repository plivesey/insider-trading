import type {
  AuctionState,
  Color,
  GameLogEntry,
  GameState,
  PlayerId,
  StockCard
} from '@insider-trading/shared';
import { maxAffordableSpend } from '@insider-trading/shared';
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
  if (initialBid > maxAffordableSpend(player.cash, player.loans)) {
    return { ok: false, error: 'bid exceeds loan limit (max 2 loans)', events };
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
  if (amount > maxAffordableSpend(bidder.cash, bidder.loans)) {
    return { ok: false, error: 'bid exceeds loan limit (max 2 loans)', events };
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
  // Rotate starting from after the bidder's slot.
  const fromIdx = auction.activeBidders.indexOf(playerId);
  advanceAuction(state, events, fromIdx);
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
  const passIdx = auction.activeBidders.indexOf(playerId);
  auction.activeBidders = auction.activeBidders.filter(id => id !== playerId);
  state.pendingPrompts[playerId] = null;
  events.push(
    event('auction_pass', `${findPlayer(state, playerId).name} passes`, { actor: playerId })
  );
  // After splicing, the next player in rotation now sits at passIdx — i.e.
  // start searching from passIdx - 1 so the +1 step lands on them.
  advanceAuction(state, events, passIdx - 1);
  return { ok: true, events };
}

/**
 * After a bid or pass, decide what's next:
 *  - If only the current high bidder remains active (and they're not in the
 *    activeBidders list either because they're the auctioneer or because
 *    everyone else passed), resolve.
 *  - Otherwise rotate `awaitingBidderId` to the next active bidder (in
 *    poker-style turn order) who is not currently the high bidder.
 *
 * `fromIdx` is the index in `activeBidders` (post-mutation) of the slot just
 * acted on; the rotation continues at `(fromIdx + 1) % length` and wraps.
 */
function advanceAuction(state: GameState, events: GameLogEntry[], fromIdx: number): void {
  const a = state.auction!;
  const n = a.activeBidders.length;
  let next: PlayerId | null = null;
  for (let i = 1; i <= n; i++) {
    const candidate = a.activeBidders[((fromIdx + i) % n + n) % n];
    if (candidate !== a.currentHighBidderId) {
      next = candidate;
      break;
    }
  }
  if (!next) {
    resolveAuction(state, events);
    return;
  }
  a.awaitingBidderId = next;
  promptForBid(state, a);
}

/** $2 off for the holder of the matching Broker card, floored at $0. Returns the actual amount paid. */
function applyBrokerDiscount(
  state: GameState,
  winner: { persistentEffects: { effect: { type: string; color?: Color } }[] },
  color: Color,
  amount: number,
  events: GameLogEntry[]
): number {
  const hasBroker = winner.persistentEffects.some(
    e => e.effect.type === 'broker_discount' && e.effect.color === color
  );
  if (!hasBroker) return amount;
  const discounted = Math.max(0, amount - 2);
  if (discounted !== amount) {
    events.push(
      event('broker_discount_applied', `Broker discount: pays $${discounted} instead of $${amount} for ${color}`, {
        payload: { color, fullAmount: amount, discountedAmount: discounted }
      })
    );
  }
  return discounted;
}

function resolveAuction(state: GameState, events: GameLogEntry[]): void {
  const a = state.auction;
  if (!a) return;
  const winner = findPlayer(state, a.currentHighBidderId);
  const cardIdx = state.market.findIndex(c => c.uid === a.cardUid);
  if (cardIdx < 0) {
    state.auction = null;
    state.turnPhase = 'awaiting_dice_bag_draw';
    return;
  }
  const card = state.market.splice(cardIdx, 1)[0];
  let amountDue = a.currentHigh;
  if (card.category === 'stock' && card.color !== 'Wild') {
    amountDue = applyBrokerDiscount(state, winner, card.color, amountDue, events);
  }
  payBank(winner, amountDue, events);
  winner.hand.push(card);
  events.push(
    event(
      'auction_resolved',
      `${winner.name} wins ${describeCard(card)} at $${amountDue}${amountDue !== a.currentHigh ? ` (bid was $${a.currentHigh})` : ''}`,
      { actor: winner.playerId, payload: { cardUid: card.uid, finalBid: a.currentHigh, amountPaid: amountDue } }
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
  state.turnPhase = 'awaiting_dice_bag_draw';
}
