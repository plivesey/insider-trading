import type {
  Color,
  GameLogEntry,
  GameState,
  HandCard,
  PlayerId,
  PlayerPrivate,
  StockCard,
  InsiderTipCard
} from '@insider-trading/shared';
import { COLORS } from '@insider-trading/shared';
import type { MutationResult } from '../domain/mutate.js';
import { adjust, setPrice } from '../domain/prices.js';
import { event } from './events.js';
import { clearPrompt, getPrompt, setPrompt } from './prompts.js';
import { findPlayer, receiveBank, refillMarketIfNeeded } from './turn.js';

export function respondToPrompt(
  state: GameState,
  playerId: PlayerId,
  promptId: string,
  response: Record<string, unknown>
): MutationResult {
  const events: GameLogEntry[] = [];
  if (state.gameOver) return { ok: false, error: 'game is over', events };
  const prompt = getPrompt(state, playerId);
  if (!prompt) return { ok: false, error: 'no pending prompt', events };
  if (prompt.promptId !== promptId) {
    return { ok: false, error: `stale prompt id (current ${prompt.promptId})`, events };
  }
  const player = findPlayer(state, playerId);
  const payload = prompt.payload || {};
  switch (prompt.type) {
    case 'auction_bid':
      return {
        ok: false,
        error: 'auction prompts go through /auction-bid, not /prompt-response',
        events
      };
    case 'peek_ack':
      clearPrompt(state, playerId);
      events.push(event('peek_ack', `${player.name} acknowledges peek`, { actor: playerId }));
      return { ok: true, events };

    case 'pick_color': {
      const exclude = payload.exclude as Color | undefined;
      const color = response.color as Color | undefined;
      if (!color || !(COLORS as readonly string[]).includes(color)) {
        return { ok: false, error: 'invalid color', events };
      }
      if (exclude && color === exclude) return { ok: false, error: `color must not be ${exclude}`, events };
      adjust(state.stockPrices, color, 1);
      clearPrompt(state, playerId);
      events.push(
        event('tip_off_resolved', `Tip-Off: ${player.name} raises ${color} +1`, {
          actor: playerId,
          payload: { color, newPrice: state.stockPrices[color] }
        })
      );
      return { ok: true, events };
    }

    case 'pick_color_amount': {
      const amount = payload.amount as number;
      const perColor = payload.perColor as boolean | undefined;
      if (perColor) {
        const choices = response.choices as Record<Color, number> | undefined;
        if (!choices) return { ok: false, error: 'choices required', events };
        for (const c of COLORS) {
          const d = choices[c];
          if (d === undefined) return { ok: false, error: `missing choice for ${c}`, events };
          if (d !== amount && d !== -amount) {
            return { ok: false, error: `choice for ${c} must be ±${amount}`, events };
          }
          adjust(state.stockPrices, c, d);
        }
        clearPrompt(state, playerId);
        events.push(
          event(
            'per_color_adjust',
            `${player.name} adjusts every stock`,
            { actor: playerId, payload: { choices, newPrices: { ...state.stockPrices } } }
          )
        );
        return { ok: true, events };
      } else {
        const color = response.color as Color | undefined;
        const sign = response.sign as 'up' | 'down' | undefined;
        if (!color || !(COLORS as readonly string[]).includes(color)) {
          return { ok: false, error: 'invalid color', events };
        }
        if (sign !== 'up' && sign !== 'down') {
          return { ok: false, error: 'sign must be up or down', events };
        }
        const delta = sign === 'up' ? amount : -amount;
        adjust(state.stockPrices, color, delta);
        clearPrompt(state, playerId);
        events.push(
          event('single_stock_adjust', `${player.name} adjusts ${color} ${delta > 0 ? '+' : ''}${delta}`, {
            actor: playerId,
            payload: { color, delta, newPrice: state.stockPrices[color] }
          })
        );
        return { ok: true, events };
      }
    }

    case 'set_stock_choice': {
      const color = response.color as Color | undefined;
      const amount = payload.amount as number;
      if (!color || !(COLORS as readonly string[]).includes(color)) {
        return { ok: false, error: 'invalid color', events };
      }
      setPrice(state.stockPrices, color, amount);
      clearPrompt(state, playerId);
      events.push(
        event('set_stock', `${player.name} sets ${color} to $${amount}`, {
          actor: playerId,
          payload: { color, amount, newPrice: state.stockPrices[color] }
        })
      );
      return { ok: true, events };
    }

    case 'adjust_two_stocks_choice': {
      const up = payload.up as number;
      const down = payload.down as number;
      const upColor = response.upColor as Color | undefined;
      const downColor = response.downColor as Color | undefined;
      if (!upColor || !downColor || upColor === downColor) {
        return { ok: false, error: 'pick two different colors', events };
      }
      adjust(state.stockPrices, upColor, up);
      adjust(state.stockPrices, downColor, -down);
      clearPrompt(state, playerId);
      events.push(
        event('adjust_two_stocks', `${player.name} ${upColor} +${up}, ${downColor} −${down}`, {
          actor: playerId,
          payload: { upColor, downColor, up, down }
        })
      );
      return { ok: true, events };
    }

    case 'pick_stock_from_hand': {
      const stockUid = response.stockUid as string | undefined;
      const mode = payload.mode as string;
      // sell_bonus_batch lets the player stop at any time. Sending `{done:true}`
      // with no stockUid ends the batch; other modes require a stockUid.
      if (mode === 'sell_bonus_batch' && response.done && !stockUid) {
        clearPrompt(state, playerId);
        events.push(event('sell_bonus_done', `${player.name} ends sell bonus batch`, { actor: playerId }));
        return { ok: true, events };
      }
      if (!stockUid) return { ok: false, error: 'stockUid required', events };
      const idx = player.hand.findIndex(c => c.uid === stockUid);
      if (idx < 0) return { ok: false, error: 'stock not in hand', events };
      const card = player.hand[idx];
      if (card.category !== 'stock' || card.color === 'Wild') {
        return { ok: false, error: 'invalid stock for selling', events };
      }
      const price = state.stockPrices[card.color];
      if (mode === 'pump_and_dump') {
        const payout = price * 2;
        receiveBank(player, payout);
        adjust(state.stockPrices, card.color, -1);
        player.hand.splice(idx, 1);
        state.discardPile.push(card);
        clearPrompt(state, playerId);
        events.push(
          event(
            'pump_and_dump_sale',
            `${player.name} Pump-and-Dumps ${card.color} for $${payout} (color −1)`,
            { actor: playerId, payload: { color: card.color, payout, newPrice: state.stockPrices[card.color] } }
          )
        );
        return { ok: true, events };
      }
      if (mode === 'sell_bonus_batch') {
        const bonus = payload.bonus as number;
        const payout = price + bonus;
        receiveBank(player, payout);
        adjust(state.stockPrices, card.color, -1);
        player.hand.splice(idx, 1);
        state.discardPile.push(card);
        events.push(
          event(
            'sell_bonus_sale',
            `${player.name} sells ${card.color} for $${price} + bonus $${bonus} = $${payout}`,
            { actor: playerId, payload: { color: card.color, payout } }
          )
        );
        // Stay on the prompt — allow more sales OR allow done.
        const done = response.done as boolean | undefined;
        if (done) {
          clearPrompt(state, playerId);
        }
        return { ok: true, events };
      }
      return { ok: false, error: 'unknown sell mode', events };
    }

    case 'pick_target_player': {
      const targetId = response.targetId as PlayerId | undefined;
      if (!targetId) return { ok: false, error: 'targetId required', events };
      if (targetId === playerId) return { ok: false, error: 'cannot target self', events };
      const target = state.players.find(p => p.playerId === targetId);
      if (!target) return { ok: false, error: 'unknown target', events };
      const stocks = target.hand.filter(c => c.category === 'stock');
      if (stocks.length === 0) {
        // No stocks; target gets compensation, free action ends.
        receiveBank(target, payload.compensation as number);
        clearPrompt(state, playerId);
        events.push(
          event(
            'hostile_takeover_noop',
            `${target.name} has no stocks; receives $${payload.compensation} regardless`,
            { actor: playerId }
          )
        );
        return { ok: true, events };
      }
      setPrompt(
        state,
        playerId,
        'pick_stock_from_target',
        `Hostile Takeover: pick a stock from ${target.name}'s hand to steal.`,
        {
          targetId,
          stocks: stocks.map(s => ({
            uid: s.uid,
            color: (s as StockCard).color,
            name: (s as StockCard).name
          })),
          compensation: payload.compensation
        }
      );
      return { ok: true, events };
    }

    case 'pick_stock_from_target': {
      const stockUid = response.stockUid as string | undefined;
      const targetId = payload.targetId as PlayerId;
      const compensation = payload.compensation as number;
      const target = state.players.find(p => p.playerId === targetId)!;
      if (!stockUid) return { ok: false, error: 'stockUid required', events };
      const tIdx = target.hand.findIndex(c => c.uid === stockUid);
      if (tIdx < 0) return { ok: false, error: 'stock not in target hand', events };
      const card = target.hand.splice(tIdx, 1)[0];
      player.hand.push(card);
      receiveBank(target, compensation);
      clearPrompt(state, playerId);
      events.push(
        event(
          'hostile_takeover_stole',
          `${player.name} steals ${(card as StockCard).color}${(card as StockCard).name ? ` ${(card as StockCard).name}` : ''} from ${target.name}; bank pays ${target.name} $${compensation}`,
          { actor: playerId, payload: { targetId, stockUid: card.uid, compensation } }
        )
      );
      return { ok: true, events };
    }

    case 'pick_market_card': {
      const cardUid = response.cardUid as string | undefined;
      const mode = payload.mode as string | undefined;
      const freeTake = payload.freeTake as boolean | undefined;
      if (!cardUid) return { ok: false, error: 'cardUid required', events };
      const mIdx = state.market.findIndex(c => c.uid === cardUid);
      if (mIdx < 0) return { ok: false, error: 'card not in market', events };
      if (freeTake) {
        // Corner the Market: take, no price move, no ability.
        const card = state.market.splice(mIdx, 1)[0];
        player.hand.push(card);
        clearPrompt(state, playerId);
        events.push(
          event('corner_the_market', `${player.name} takes ${card.uid} from market`, {
            actor: playerId,
            payload: { cardUid: card.uid }
          })
        );
        refillMarketIfNeeded(state, events);
        return { ok: true, events };
      }
      if (mode === 'swap_with_market_stage1') {
        // Stage 2: pick a hand stock to swap with this market card.
        setPrompt(
          state,
          playerId,
          'pick_hand_stock_for_swap',
          'Pick one of your stocks to swap with the chosen market card.',
          { marketCardUid: cardUid }
        );
        return { ok: true, events };
      }
      return { ok: false, error: 'unknown pick_market_card mode', events };
    }

    case 'pick_hand_stock_for_swap': {
      const stockUid = response.stockUid as string | undefined;
      const marketCardUid = payload.marketCardUid as string;
      if (!stockUid) return { ok: false, error: 'stockUid required', events };
      const hIdx = player.hand.findIndex(c => c.uid === stockUid);
      const mIdx = state.market.findIndex(c => c.uid === marketCardUid);
      if (hIdx < 0 || mIdx < 0) return { ok: false, error: 'card not found', events };
      const handCard = player.hand[hIdx];
      const marketCard = state.market[mIdx];
      if (handCard.category !== 'stock') return { ok: false, error: 'must swap a stock', events };
      // Swap.
      player.hand[hIdx] = marketCard;
      state.market[mIdx] = handCard;
      clearPrompt(state, playerId);
      events.push(
        event(
          'swap_with_market',
          `${player.name} swaps ${stockUid} for ${marketCardUid}`,
          { actor: playerId, payload: { stockUid, marketCardUid } }
        )
      );
      return { ok: true, events };
    }

    case 'wild_speculation_choice': {
      const color = payload.color as Color;
      const amount = payload.amount as number;
      const sign = response.sign as 'up' | 'down' | undefined;
      if (sign !== 'up' && sign !== 'down') return { ok: false, error: 'sign must be up or down', events };
      adjust(state.stockPrices, color, sign === 'up' ? amount : -amount);
      clearPrompt(state, playerId);
      events.push(
        event(
          'wild_speculation_resolved',
          `Wild Speculation: ${color} ${sign === 'up' ? '+' : '−'}${amount}`,
          { actor: playerId, payload: { color, sign, newPrice: state.stockPrices[color] } }
        )
      );
      return { ok: true, events };
    }

    case 'draw_and_keep': {
      const keepUids = response.keepUids as string[] | undefined;
      const stagedCards = payload.stagedCards as HandCard[] | undefined;
      const keepCount = payload.keepCount as number;
      if (!keepUids || !Array.isArray(keepUids) || keepUids.length !== keepCount) {
        return { ok: false, error: `must keep exactly ${keepCount}`, events };
      }
      if (!stagedCards) return { ok: false, error: 'staged cards missing', events };
      const kept: HandCard[] = [];
      const returnedToBottom: HandCard[] = [];
      for (const c of stagedCards) {
        if (keepUids.includes(c.uid)) kept.push(c);
        else returnedToBottom.push(c);
      }
      if (kept.length !== keepCount) {
        return { ok: false, error: 'keepUids does not match staged cards', events };
      }
      player.hand.push(...kept);
      state.mainDeck.push(...returnedToBottom);
      clearPrompt(state, playerId);
      events.push(
        event(
          'draw_and_keep_resolved',
          `${player.name} kept ${kept.length}, returned ${returnedToBottom.length} to bottom`,
          { actor: playerId, payload: { keptUids: kept.map(c => c.uid) } }
        )
      );
      return { ok: true, events };
    }

    case 'reorder_tips': {
      const order = response.order as string[] | undefined;
      const stagedUids = payload.stagedUids as string[];
      if (!order || order.length !== stagedUids.length) {
        return { ok: false, error: 'order length mismatch', events };
      }
      const all = new Set(stagedUids);
      for (const id of order) {
        if (!all.has(id)) return { ok: false, error: `unknown tip uid ${id}`, events };
      }
      // Rebuild the top of the insider tip deck in the chosen order.
      const top: InsiderTipCard[] = [];
      for (const uid of order) {
        const t = state.insiderTipDeck.find(t => t.uid === uid)!;
        top.push(t);
      }
      const rest = state.insiderTipDeck.filter(t => !all.has(t.uid));
      state.insiderTipDeck = [...top, ...rest];
      clearPrompt(state, playerId);
      events.push(
        event('tips_reordered', `${player.name} reordered the top insider tips`, {
          actor: playerId,
          payload: { order }
        })
      );
      return { ok: true, events };
    }
  }
}
