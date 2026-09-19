import type {
  ActionCard,
  Color,
  DeckCard,
  GameLogEntry,
  GameState,
  PlayerId,
  PlayerPrivate,
  StockCard
} from '@insider-trading/shared';
import { MAX_LOANS, LOAN_CASH } from '@insider-trading/shared';
import { adjust } from '../domain/prices.js';
import { reshuffleDiscardIfNeeded } from '../domain/deck.js';
import type { MutationResult } from '../domain/mutate.js';
import { event } from './events.js';
import { setPrompt, hasAnyPendingPrompt } from './prompts.js';
import { adjustAllStocks, drawEventCardsIntoHand, drawFromEventDeck } from './eventDeck.js';
import { collectFinalGoalOffers, describeEventCardForPrompt } from './goals.js';
import { drawDieFromBag, rollDieFace, nextRng } from './rng.js';
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
  // Respect the hard loan cap: never issue beyond MAX_LOANS. Callers must gate
  // spends with maxAffordableSpend() so this clamp is never actually binding.
  const loansNeeded = Math.min(Math.ceil(owed / LOAN_CASH), Math.max(0, MAX_LOANS - player.loans));
  player.cash += loansNeeded * LOAN_CASH;
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

  state.turnPhase = 'awaiting_dice_bag_draw';
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
      if (state.variant === 'alternate') {
        // Alternate: Scout gains the top event card into hand instead of
        // just peeking at it.
        const [drawn] = drawEventCardsIntoHand(state, 1);
        if (drawn) {
          buyer.hand.push(drawn);
          events.push(
            event(
              'special_scout_gain',
              `Scout: ${buyer.name} gains ${drawn.category === 'insider_tip' ? 'a market-movement card' : 'a private goal'} from the event deck`,
              { actor: buyer.playerId, payload: { uid: drawn.uid, category: drawn.category } }
            )
          );
        } else {
          events.push(
            event('special_scout_empty', `Scout: ${buyer.name} gains nothing — the event deck is empty`, {
              actor: buyer.playerId
            })
          );
        }
        break;
      }
      // Classic: Scout peeks the top 1 card of the event deck.
      const top = state.eventDeck.slice(0, 1);
      if (top.length > 0) {
        setPrompt(
          state,
          buyer.playerId,
          'peek_ack',
          `Scout: top event card is "${top[0].category === 'insider_tip' ? top[0].text : top[0].goal.text}". Acknowledge to continue.`,
          { cards: top.map(describeEventCardForPrompt) }
        );
      }
      break;
    }
    case 'peek_sell': {
      // Informant (V5: triggers on buy, same as Scout): peek the top 2 cards.
      const top = state.eventDeck.slice(0, 2);
      if (top.length > 0) {
        setPrompt(
          state,
          buyer.playerId,
          'peek_ack',
          `Informant: top ${top.length} event card${top.length > 1 ? 's' : ''}. Acknowledge to continue.`,
          { cards: top.map(describeEventCardForPrompt) }
        );
      }
      break;
    }
    case 'blank':
      // No on-buy effect.
      break;
  }
}

export function refillMarketIfNeeded(state: GameState, events: GameLogEntry[]): void {
  while (state.market.length < 5) {
    if (state.mainDeck.length === 0) {
      const reshufflable = state.discardPile.filter(
        (c): c is DeckCard => c.category === 'stock' || c.category === 'action'
      );
      if (reshufflable.length === 0) break;
      reshuffleDiscardIfNeeded(state.mainDeck, reshufflable, 1, makeMutationRng(state));
      state.discardPile = [];
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

/**
 * Draw the top card of the market deck into `player`'s hand, reshuffling the
 * discard pile in if the deck is empty. Returns the drawn card, or null if
 * no card could be drawn (deck and discard both empty).
 */
export function drawTopOfDeck(
  state: GameState,
  player: PlayerPrivate,
  events: GameLogEntry[]
): (StockCard | ActionCard) | null {
  if (state.mainDeck.length === 0) {
    const reshufflable = state.discardPile.filter(
      (c): c is DeckCard => c.category === 'stock' || c.category === 'action'
    );
    if (reshufflable.length > 0) {
      reshuffleDiscardIfNeeded(state.mainDeck, reshufflable, 1, makeMutationRng(state));
      state.discardPile = [];
    }
  }
  if (state.mainDeck.length === 0) return null;
  const card = state.mainDeck.shift()!;
  player.hand.push(card);
  // The reshuffle above (if it ran) can hand the market a lifeline it has no
  // other way to notice: once market hits 0, no auction/Fire Sale/Corner the
  // Market is possible to trigger a refill, so a starved market can only
  // recover via cards freshly entering mainDeck like this.
  refillMarketIfNeeded(state, events);
  return card;
}

export function describeCard(card: { category: string; color?: string; name?: string; uid: string }): string {
  if (card.category === 'stock') return `${(card as StockCard).color}${(card as StockCard).name ? ` ${(card as StockCard).name}` : ''}`;
  if (card.category === 'action') return `Action: ${(card as ActionCard).name}`;
  if (card.category === 'insider_tip') return 'Market Movement';
  if (card.category === 'goal') return 'Goal';
  return card.uid;
}

// ---- END OF TURN: dice bag draw ----

export function resolveEndOfTurnDiceBag(state: GameState, events: GameLogEntry[]): void {
  const dieId = drawDieFromBag(state);
  const face = rollDieFace(dieId, state);
  events.push(
    event('die_roll', `Dice bag: drew ${dieId}, rolled ${face}`, { payload: { die: dieId, face } })
  );
  switch (face) {
    case 'nothing':
      events.push(event('die_effect_noop', 'Dice bag: nothing happens', {}));
      return;
    case 'bull': {
      const before = { ...state.stockPrices };
      adjustAllStocks(state, 1);
      events.push(
        event('die_effect_bull', 'Bull Market — all stocks rise +1', {
          payload: { before, after: { ...state.stockPrices } }
        })
      );
      return;
    }
    case 'bear': {
      const before = { ...state.stockPrices };
      adjustAllStocks(state, -1);
      events.push(
        event('die_effect_bear', 'Bear Market — all stocks fall −1', {
          payload: { before, after: { ...state.stockPrices } }
        })
      );
      return;
    }
    case 'draw1':
      drawFromEventDeck(state, 1, events);
      return;
    case 'draw2':
      drawFromEventDeck(state, 2, events);
      return;
    case 'draw3':
      drawFromEventDeck(state, 3, events);
      return;
  }
}

// ---- END CONDITION + SCORING ----

/**
 * V5's sole end condition: the progress tracker has reached its threshold.
 * Deck exhaustion and "only 2 goals remain" (V4's end conditions) no longer
 * apply.
 *
 * Only called from the 'turn_complete' phase (i.e. after the triggering
 * player's whole turn -- including any auction -- has played out normally),
 * never mid-turn, so hitting the threshold never cuts a turn short.
 */
export function checkProgressThreshold(state: GameState, events: GameLogEntry[]): void {
  if (state.gameOver) return;
  if (state.progressTracker < state.progressThreshold) return;
  beginGameEnding(state, events);
}

/**
 * The threshold has been reached. Rather than end instantly -- which could
 * deny a player a goal their own turn's auction just made claimable -- offer
 * a final claim to everyone who can complete one right now, then finalize
 * once every offer has been answered (see advance.ts's 'game_ending' phase
 * handling and promptResponse.ts's 'final_goal_offer' case).
 */
function beginGameEnding(state: GameState, events: GameLogEntry[]): void {
  const offers = collectFinalGoalOffers(state);
  if (offers.length === 0) {
    finalizeGameOver(state, events);
    return;
  }
  state.turnPhase = 'game_ending';
  for (const offer of offers) {
    setPrompt(
      state,
      offer.playerId,
      'final_goal_offer',
      `The game is ending (progress tracker ${state.progressTracker}/${state.progressThreshold}). You can complete "${offer.goalText}" (${offer.rewardText}) -- claim it before final scoring?`,
      {
        goalUid: offer.goalUid,
        isPrivate: offer.isPrivate,
        goalText: offer.goalText,
        rewardText: offer.rewardText
      }
    );
  }
  events.push(
    event(
      'game_ending_final_offers',
      `Progress tracker reached ${state.progressTracker}/${state.progressThreshold} -- offering a final goal claim to ${offers.length} player${offers.length > 1 ? 's' : ''} before scoring`,
      { payload: { offers: offers.map(o => ({ playerId: o.playerId, goalUid: o.goalUid, isPrivate: o.isPrivate })) } }
    )
  );
}

/** Called once every final-goal-offer prompt (and any reward sub-prompt it triggered) has resolved. */
export function finalizeGameEnding(state: GameState, events: GameLogEntry[]): void {
  if (state.gameOver) return;
  finalizeGameOver(state, events);
}

function finalizeGameOver(state: GameState, events: GameLogEntry[]): void {
  const breakdown = computeBreakdown(state);
  const winners = selectWinners(breakdown);
  state.gameOver = {
    reason: 'progress_threshold_reached',
    winnerPlayerIds: winners,
    breakdown,
    endedAt: new Date().toISOString()
  };
  state.status = 'finished';
  state.turnPhase = 'turn_complete';
  events.push(
    event(
      'game_over',
      `Game over (progress tracker reached ${state.progressTracker}/${state.progressThreshold}). Winner(s): ${winners
        .map(id => state.players.find(p => p.playerId === id)?.name)
        .join(', ')}`,
      { payload: { reason: 'progress_threshold_reached', winnerPlayerIds: winners, breakdown } }
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
