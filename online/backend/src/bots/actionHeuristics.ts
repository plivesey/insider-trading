import type {
  ActionCard,
  GameState,
  PlayerId
} from '@insider-trading/shared';
import type { BotProfile } from './profile.js';
import {
  maxColorCount,
  ownsAnyColoredStock,
  perceivedActionCardValue,
  perceivedCardValue,
  perceivedStockCardValue
} from './valuation.js';
import type { StockCard } from '@insider-trading/shared';

/**
 * Should the bot bother playing this action card right now?
 * Guards against trivially-fizzling plays (e.g. Pump and Dump with no stocks)
 * and low-value plays (Corner the Market with no good market targets).
 */
export function shouldPlayActionCard(
  card: ActionCard,
  state: GameState,
  profile: BotProfile,
  botId: PlayerId
): boolean {
  switch (card.effect.type) {
    case 'draw_and_choose':
      // Tipster's Choice — always safe.
      return state.mainDeck.length > 0;
    case 'take_face_up': {
      // Corner the Market — play only if a market card is worth >= $4.
      let best = 0;
      for (const c of state.market) {
        if (c.category !== 'stock' && c.category !== 'action') continue;
        const v = perceivedCardValue(c as never, state, profile, botId);
        if (v > best) best = v;
      }
      return best >= 4;
    }
    case 'sell_double':
      return ownsAnyColoredStock(state, botId);
    case 'sell_same_bonus':
      // Liquidation — worth playing once the bot holds ≥2 of a single color.
      return maxColorCount(state, botId) >= 2;
    case 'adjust_stock':
      // The Squeeze — only useful if bot owns ≥1 colored stock.
      return maxColorCount(state, botId) >= 1;
    case 'flip_and_adjust':
    case 'tie_breaker':
    case 'broker_discount':
      return true;
    case 'steal_stock': {
      // Hostile Takeover — useful only if some opponent has ≥1 stock.
      return state.players.some(
        p => p.playerId !== botId && p.hand.some(c => c.category === 'stock')
      );
    }
    case 'adjust_all_stocks':
      return true;
    case 'draw_tip':
      // Insider Source — only play if there's a card to draw.
      return state.eventDeck.length > 0;
    case 'fire_sale': {
      // Only worth the flat $3 if some market stock is worth more than that.
      let best = 0;
      for (const c of state.market) {
        if (c.category === 'stock' && c.color !== 'Wild') {
          const v = perceivedStockCardValue(state, profile, c as StockCard, botId);
          if (v > best) best = v;
        }
      }
      return best > 3;
    }
    case 'first_look':
      return state.mainDeck.length > 0;
    case 'foresight':
      return state.eventDeck.length > 0;
    case 'windfall':
      return true;
    case 'market_panic':
      return state.players.some(p => p.playerId !== botId);
    case 'backroom_deal': {
      const bot = state.players.find(p => p.playerId === botId);
      return !!bot && bot.hand.some(c => c.category !== 'bonus') && state.market.length > 0;
    }
    case 'double_down': {
      const bot = state.players.find(p => p.playerId === botId);
      return (
        !!bot &&
        bot.hand.some(c => c.category === 'action' && c.uid !== card.uid && !(c as ActionCard).persistent)
      );
    }
  }
}

/**
 * Pick the highest-valued playable action card from the bot's hand, or null.
 * Returns the card uid.
 */
export function chooseActionCardToPlay(
  state: GameState,
  profile: BotProfile,
  botId: PlayerId
): string | null {
  const bot = state.players.find(p => p.playerId === botId);
  if (!bot) return null;
  let best: { uid: string; value: number } | null = null;
  for (const c of bot.hand) {
    if (c.category !== 'action') continue;
    if (!shouldPlayActionCard(c, state, profile, botId)) continue;
    const value = perceivedActionCardValue(c, state, profile, botId);
    if (!best || value > best.value) best = { uid: c.uid, value };
  }
  return best?.uid ?? null;
}
