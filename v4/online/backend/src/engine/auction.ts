import type {
  ActionCard,
  AuctionState,
  GameLogEntry,
  GameState,
  InsiderTipCard,
  PlayerId,
  PlayerPrivate,
  StockCard,
  TurnPhase
} from '@insider-trading/shared';
import { maxAffordableSpend } from '@insider-trading/shared';
import type { MutationResult } from '../domain/mutate.js';
import { adjust } from '../domain/prices.js';
import { event } from './events.js';
import { hasAnyPendingPrompt, setPrompt } from './prompts.js';
import { nextRng } from './rng.js';
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
    return { ok: false, error: 'bid exceeds loan limit (max 3 loans)', events };
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

/**
 * If a Black Market card is face-up in the market and no auction is in flight,
 * remove it (single-use trigger; the card leaves the game), refill that slot,
 * draw a random tip from the unused pool, and start a side-auction for it.
 * If the unused pool is empty, the trigger fizzles (card still removed).
 * Returns true if a side-auction was started.
 */
export function tryFireBlackMarketTrigger(
  state: GameState,
  events: GameLogEntry[]
): boolean {
  if (state.auction) return false;
  const idx = state.market.findIndex(
    c =>
      c.category === 'action' &&
      (c as ActionCard).effect.type === 'auction_unused_tip'
  );
  if (idx < 0) return false;
  const card = state.market.splice(idx, 1)[0] as ActionCard;
  events.push(
    event('black_market_revealed', `Black Market flips face-up — side-auction triggered`, {
      payload: { uid: card.uid }
    })
  );
  // Refill the slot the Black Market vacated. A second Black Market dealt
  // into that slot will be caught on a later trigger pass (after this side-
  // auction resolves).
  refillMarketIfNeeded(state, events);
  if (state.unusedInsiderTipPool.length === 0) {
    events.push(
      event(
        'black_market_fizzle',
        'Black Market fizzles: no unused Insider Tips left to auction',
        {}
      )
    );
    return false;
  }
  // The phase to restore after the side-auction resolves. If the previous
  // phase was `in_auction` (e.g., trigger fires mid-turn via market refill),
  // we collapse it to awaiting_die_roll since the original market auction
  // already concluded by the time refill ran.
  const resumePhase: TurnPhase =
    state.turnPhase === 'in_auction' ? 'awaiting_die_roll' : state.turnPhase;
  const rng = nextRng(state);
  const tipIdx = rng.int(state.unusedInsiderTipPool.length);
  const tip = state.unusedInsiderTipPool.splice(tipIdx, 1)[0];
  startSideAuction(state, tip, resumePhase, events);
  return true;
}

/**
 * Begin a Black Market side-auction for a face-down Insider Tip. The current
 * player is the auctioneer; bidding rotates poker-style; min bid is $0
 * (auctioneer can take it for free if no one else raises). The auctioned tip
 * is NOT placed in market — it sits inside the auction state.
 */
export function startSideAuction(
  state: GameState,
  tip: InsiderTipCard,
  resumePhase: TurnPhase,
  events: GameLogEntry[]
): void {
  const auctioneer = currentPlayer(state);
  const n = state.players.length;
  const order: PlayerId[] = [];
  for (let i = 1; i < n; i++) {
    order.push(state.players[(state.currentPlayerIndex + i) % n].playerId);
  }
  order.push(auctioneer.playerId);
  const auction: AuctionState = {
    cardUid: tip.uid,
    auctioneerId: auctioneer.playerId,
    initialBid: 0,
    currentHigh: 0,
    currentHighBidderId: auctioneer.playerId,
    activeBidders: order,
    awaitingBidderId: order[0] ?? null,
    sideAuctionTip: tip,
    resumePhase
  };
  state.auction = auction;
  state.turnPhase = 'in_auction';
  events.push(
    event(
      'side_auction_started',
      `Black Market: ${auctioneer.name} opens a side-auction for a face-down Insider Tip at $0`,
      {
        actor: auctioneer.playerId,
        payload: { tipUid: tip.uid, initialBid: 0, order, resumePhase }
      }
    )
  );
  if (auction.awaitingBidderId) {
    promptForBid(state, auction);
  } else {
    resolveAuction(state, events);
  }
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
    return { ok: false, error: 'bid exceeds loan limit (max 3 loans)', events };
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

function resolveAuction(state: GameState, events: GameLogEntry[]): void {
  const a = state.auction;
  if (!a) return;
  const winner = findPlayer(state, a.currentHighBidderId);
  if (a.sideAuctionTip) {
    // Black Market side-auction: winner pays and takes the (face-down) tip
    // into hand. Market is untouched; restore the prior turnPhase.
    const tip = a.sideAuctionTip;
    const resume = a.resumePhase ?? 'awaiting_die_roll';
    payBank(winner, a.currentHigh, events);
    winner.hand.push(tip);
    events.push(
      event(
        'side_auction_resolved',
        `${winner.name} wins the face-down Insider Tip at $${a.currentHigh}`,
        { actor: winner.playerId, payload: { tipUid: tip.uid, finalBid: a.currentHigh } }
      )
    );
    state.auction = null;
    state.turnPhase = resume;
    return;
  }
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
