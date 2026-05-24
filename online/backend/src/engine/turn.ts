import type {
  ActionCard,
  Color,
  GameLogEntry,
  GameState,
  PlayerId,
  PlayerPrivate,
  StockCard
} from '@insider-trading/shared';
import { COLORS } from '@insider-trading/shared';
import { adjust } from '../domain/prices.js';
import { reshuffleDiscardIfNeeded } from '../domain/deck.js';
import type { MutationResult } from '../domain/mutate.js';
import { event } from './events.js';
import { setPrompt, hasAnyPendingPrompt } from './prompts.js';
import { adjustAllStocks, flipAndResolveTopTip } from './insiderTip.js';
import { rollD6, nextRng } from './rng.js';
import { computeBreakdown, selectWinners } from './scoring.js';

export function currentPlayer(state: GameState): PlayerPrivate {
  return state.players[state.currentPlayerIndex];
}

export function findPlayer(state: GameState, id: PlayerId): PlayerPrivate {
  const p = state.players.find(p => p.playerId === id);
  if (!p) throw new Error(`unknown player: ${id}`);
  return p;
}

export function payBank(player: PlayerPrivate, amount: number, events: GameLogEntry[]): void {
  if (amount <= 0) return;
  if (player.cash >= amount) {
    player.cash -= amount;
    return;
  }
  const owed = amount - player.cash;
  const loansNeeded = Math.ceil(owed / 10);
  player.cash += loansNeeded * 10;
  player.loans += loansNeeded;
  player.cash -= amount;
  events.push(
    event('auto_loan', `${player.name} takes ${loansNeeded} loan${loansNeeded > 1 ? 's' : ''} ($${loansNeeded * 10})`, {
      actor: player.playerId,
      payload: { loansTaken: loansNeeded, newLoansTotal: player.loans, newCash: player.cash }
    })
  );
}

export function receiveBank(player: PlayerPrivate, amount: number): void {
  player.cash += amount;
}

// ---- TURN ACTION: SELL STOCK ----

export function sellStock(state: GameState, playerId: PlayerId, stockUid: string): MutationResult {
  const events: GameLogEntry[] = [];
  if (state.gameOver) return { ok: false, error: 'game is over', events };
  if (state.turnPhase !== 'awaiting_turn_action') {
    return { ok: false, error: `cannot sell during phase ${state.turnPhase}`, events };
  }
  if (hasAnyPendingPrompt(state)) {
    return { ok: false, error: 'pending prompts must resolve first', events };
  }
  const player = currentPlayer(state);
  if (player.playerId !== playerId) {
    return { ok: false, error: `not ${playerId}'s turn`, events };
  }
  const idx = player.hand.findIndex(c => c.uid === stockUid);
  if (idx < 0) return { ok: false, error: 'stock not in hand', events };
  const card = player.hand[idx];
  if (card.category !== 'stock') return { ok: false, error: 'card is not a stock', events };
  if (card.color === 'Wild') return { ok: false, error: 'Wild Shares cannot be sold', events };
  const price = state.stockPrices[card.color];
  player.hand.splice(idx, 1);
  receiveBank(player, price);
  adjust(state.stockPrices, card.color, -1);
  state.discardPile.push(card);
  events.push(
    event('sell_stock', `${player.name} sold ${card.color}${card.name ? ` (${card.name})` : ''} for $${price}`, {
      actor: playerId,
      payload: { stockUid: card.uid, color: card.color, price, newPrice: state.stockPrices[card.color] }
    })
  );

  // Informant: when sold, peek at the top insider tip.
  if (card.type === 'peek_sell') {
    const top = state.insiderTipDeck[0];
    if (top) {
      setPrompt(
        state,
        playerId,
        'peek_ack',
        `Informant: top Insider Tip is "${top.text}". Acknowledge to continue.`,
        { tip: { text: top.text, type: top.type } }
      );
    }
  }

  state.turnPhase = 'awaiting_die_roll';
  return { ok: true, events };
}

// ---- AUCTION SUPPORT (resolution lives in engine/auction.ts) ----

export function resolveStockSpecialOnBuy(
  state: GameState,
  buyer: PlayerPrivate,
  card: StockCard,
  events: GameLogEntry[]
): void {
  if (card.color === 'Wild') return; // Wild Shares have no on-buy effect
  // Always: color +1 from purchase already applied by caller.
  switch (card.type) {
    case 'extra_up': {
      adjust(state.stockPrices, card.color as Color, 1);
      events.push(
        event(
          'special_extra_up',
          `Boom: ${card.color} rises an extra +1 (now $${state.stockPrices[card.color as Color]})`,
          { actor: buyer.playerId, payload: { color: card.color } }
        )
      );
      break;
    }
    case 'other_up': {
      setPrompt(
        state,
        buyer.playerId,
        'pick_color',
        `Tip-Off: pick a color (other than ${card.color}) to raise +1.`,
        { exclude: card.color }
      );
      break;
    }
    case 'peek_buy': {
      const top = state.insiderTipDeck[0];
      if (top) {
        setPrompt(
          state,
          buyer.playerId,
          'peek_ack',
          `Scout: top Insider Tip is "${top.text}". Acknowledge to continue.`,
          { tip: { text: top.text, type: top.type } }
        );
      }
      break;
    }
    case 'peek_sell':
    case 'blank':
      // No on-buy effect for these.
      break;
  }
}

export function refillMarketIfNeeded(state: GameState, events: GameLogEntry[]): void {
  while (state.market.length < 5) {
    if (state.mainDeck.length === 0) {
      // Reshuffle deckable cards from discard. Hot Tips don't reshuffle.
      const reshufflable = state.discardPile.filter(
        (c): c is import('@insider-trading/shared').DeckCard =>
          c.category === 'stock' || c.category === 'action'
      );
      if (reshufflable.length === 0) break;
      reshuffleDiscardIfNeeded(state.mainDeck, reshufflable, 1, makeMutationRng(state));
      // Remove reshuffled cards from discardPile.
      state.discardPile = state.discardPile.filter(c => c.category === 'hot_tip');
    }
    if (state.mainDeck.length === 0) break;
    const next = state.mainDeck.shift()!;
    state.market.push(next);
    events.push(
      event('market_refill', `Market refilled with ${describeCard(next)}`, {
        payload: { uid: next.uid }
      })
    );
  }
}

function makeMutationRng(state: GameState) {
  return nextRng(state);
}

export function describeCard(card: { category: string; color?: string; name?: string; uid: string }): string {
  if (card.category === 'stock') return `${(card as StockCard).color}${(card as StockCard).name ? ` ${(card as StockCard).name}` : ''}`;
  if (card.category === 'action') return `Action: ${(card as ActionCard).name}`;
  return card.uid;
}

// ---- END OF TURN: die roll ----

export function rollEndOfTurnDie(state: GameState, events: GameLogEntry[]): void {
  const die = rollD6(state);
  events.push(
    event('die_roll', `Die rolled: ${die}`, { payload: { die } })
  );
  if (die === 1) {
    if (state.insiderTipDeck.length > 0) {
      flipAndResolveTopTip(state, events);
    } else {
      events.push(event('die_effect_noop', 'Die roll: 1, but Insider Tip deck is empty', {}));
    }
  } else if (die === 6) {
    const before = { ...state.stockPrices };
    adjustAllStocks(state, 1);
    events.push(
      event('die_effect_all_up', 'Die roll: 6 — all stocks rise +1', {
        payload: { before, after: { ...state.stockPrices } }
      })
    );
  }
}

// ---- END CONDITIONS + SCORING ----

export function checkEndConditions(state: GameState, events: GameLogEntry[]): void {
  if (state.gameOver) return;
  let reason: 'insider_tip_deck_empty' | 'one_goal_remaining' | null = null;
  if (state.insiderTipDeck.length === 0) reason = 'insider_tip_deck_empty';
  else if (state.activeGoals.length <= 1) reason = 'one_goal_remaining';
  if (!reason) return;
  const breakdown = computeBreakdown(state);
  const winners = selectWinners(breakdown);
  state.gameOver = {
    reason,
    winnerPlayerIds: winners,
    breakdown,
    endedAt: new Date().toISOString()
  };
  state.status = 'finished';
  state.turnPhase = 'turn_complete';
  events.push(
    event(
      'game_over',
      `Game over (${reason}). Winner(s): ${winners
        .map(id => state.players.find(p => p.playerId === id)?.name)
        .join(', ')}`,
      { payload: { reason, winnerPlayerIds: winners, breakdown } }
    )
  );
}

export function advanceTurn(state: GameState, events: GameLogEntry[]): void {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  state.turnNumber += 1;
  state.turnPhase = 'awaiting_turn_action';
  events.push(
    event(
      'turn_start',
      `Turn ${state.turnNumber}: ${state.players[state.currentPlayerIndex].name}`,
      {
        payload: { turnNumber: state.turnNumber, playerId: state.players[state.currentPlayerIndex].playerId }
      }
    )
  );
}
