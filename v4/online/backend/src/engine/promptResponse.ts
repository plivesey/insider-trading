import type {
  Color,
  DeckCard,
  GameLogEntry,
  GameState,
  HandCard,
  PlayerId,
  PlayerPrivate,
  StockCard,
  InsiderTipCard
} from '@insider-trading/shared';
import { COLORS, maxAffordableSpend } from '@insider-trading/shared';
import type { MutationResult } from '../domain/mutate.js';
import { adjust, setPrice } from '../domain/prices.js';
import { event } from './events.js';
import { resolveTip } from './insiderTip.js';
import { clearPrompt, getPrompt, setPrompt } from './prompts.js';
import {
  describeCard,
  drawTopOfDeck,
  findPlayer,
  payBank,
  receiveBank,
  refillMarketIfNeeded,
  resolveStockSpecialOnBuy
} from './turn.js';

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

    case 'peek_bottom_choice': {
      // Peeked the top N tips; may move ONE of them to the bottom of the deck.
      // `{}` / no bottomUid = keep them in place. The deck size is unchanged, so
      // this never ends the game.
      const bottomUid = response.bottomUid as string | undefined;
      if (bottomUid) {
        const count = payload.count as number;
        const idx = state.insiderTipDeck.findIndex(t => t.uid === bottomUid);
        if (idx < 0 || idx >= count) {
          return { ok: false, error: 'tip not among the peeked top cards', events };
        }
        const [tip] = state.insiderTipDeck.splice(idx, 1);
        state.insiderTipDeck.push(tip);
        clearPrompt(state, playerId);
        events.push(
          event('peek_tip_to_bottom', `${player.name} moves an Insider Tip to the bottom of the deck`, {
            actor: playerId,
            payload: { uid: tip.uid }
          })
        );
      } else {
        clearPrompt(state, playerId);
        events.push(
          event('peek_tip_kept', `${player.name} leaves the peeked Insider Tips in place`, { actor: playerId })
        );
      }
      return { ok: true, events };
    }

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
      // sell_bonus_batch / sell_same_bonus let the player stop at any time.
      // Sending `{done:true}` with no stockUid ends the batch; other modes
      // require a stockUid.
      if ((mode === 'sell_bonus_batch' || mode === 'sell_same_bonus') && response.done && !stockUid) {
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
        // Informant: when sold (including via Pump-and-Dump), peek at the top
        // Insider Tip. Matches the normal sellStock flow in turn.ts.
        if ((card as StockCard).type === 'peek_sell') {
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
        return { ok: true, events };
      }
      if (mode === 'sell_bonus_batch' || mode === 'sell_same_bonus') {
        // sell_same_bonus (Liquidation) locks the batch to a single color: the
        // first sale sets lockedColor; later sales must match it.
        if (mode === 'sell_same_bonus') {
          const locked = payload.lockedColor as Color | undefined;
          if (locked && locked !== card.color) {
            return { ok: false, error: `Liquidation locked to ${locked}; cannot sell ${card.color}`, events };
          }
          if (!locked) payload.lockedColor = card.color;
        }
        const bonus = payload.bonus as number;
        // Every stock in a batch sells at the batch's OPENING price for its
        // color: record that price on the first sale, then keep paying it out
        // even as the color falls −1 per stock. This stops earlier sales in the
        // batch from cannibalizing the payout of later ones.
        const batchPrices = (payload.batchPrices as Record<string, number> | undefined) ?? {};
        if (batchPrices[card.color] === undefined) batchPrices[card.color] = price;
        payload.batchPrices = batchPrices;
        const salePrice = batchPrices[card.color];
        const payout = salePrice + bonus;
        receiveBank(player, payout);
        adjust(state.stockPrices, card.color, -1);
        player.hand.splice(idx, 1);
        state.discardPile.push(card);
        events.push(
          event(
            'sell_bonus_sale',
            `${player.name} sells ${card.color} for $${salePrice} + bonus $${bonus} = $${payout} (color −1)`,
            { actor: playerId, payload: { color: card.color, payout, newPrice: state.stockPrices[card.color] } }
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
        // No stocks; target draws the top card of the deck instead, free action ends.
        const drawn = drawTopOfDeck(state, target, events);
        clearPrompt(state, playerId);
        events.push(
          event(
            'hostile_takeover_noop',
            drawn
              ? `${target.name} has no stocks; draws ${describeCard(drawn)} from the deck instead`
              : `${target.name} has no stocks; deck is empty, no draw`,
            { actor: playerId, payload: drawn ? { drawnUid: drawn.uid } : {} }
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
          }))
        }
      );
      return { ok: true, events };
    }

    case 'pick_stock_from_target': {
      const stockUid = response.stockUid as string | undefined;
      const targetId = payload.targetId as PlayerId;
      const target = state.players.find(p => p.playerId === targetId)!;
      if (!stockUid) return { ok: false, error: 'stockUid required', events };
      const tIdx = target.hand.findIndex(c => c.uid === stockUid);
      if (tIdx < 0) return { ok: false, error: 'stock not in target hand', events };
      const card = target.hand.splice(tIdx, 1)[0];
      player.hand.push(card);
      const drawn = drawTopOfDeck(state, target, events);
      clearPrompt(state, playerId);
      events.push(
        event(
          'hostile_takeover_stole',
          `${player.name} steals ${(card as StockCard).color}${(card as StockCard).name ? ` ${(card as StockCard).name}` : ''} from ${target.name}; ${target.name} ${drawn ? `draws ${describeCard(drawn)} from the deck` : 'cannot draw (deck empty)'}`,
          { actor: playerId, payload: { targetId, stockUid: card.uid, drawnUid: drawn?.uid } }
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
      // Can't grab the card currently being auctioned — that would let the
      // player dodge their bid commitment or steal an in-progress auction.
      if (state.auction && state.auction.cardUid === cardUid) {
        return { ok: false, error: 'cannot target the card being auctioned', events };
      }
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
        // Stage 2: pick any hand card to swap with this market card.
        setPrompt(
          state,
          playerId,
          'pick_hand_stock_for_swap',
          'Pick one of your cards to swap with the chosen market card.',
          { marketCardUid: cardUid }
        );
        return { ok: true, events };
      }
      if (mode === 'buy_from_market') {
        // Market Order: pay the chosen stock's current price (auto-loan if
        // short) and take it; the purchase raises that color +1, then the
        // stock's special-on-buy ability resolves — same as a normal buy.
        const target = state.market[mIdx];
        if (target.category !== 'stock' || target.color === 'Wild') {
          return { ok: false, error: 'Market Order must buy a colored stock', events };
        }
        const color = target.color as Color;
        const price = state.stockPrices[color];
        if (price > maxAffordableSpend(player.cash, player.loans)) {
          // Can't afford within the loan cap — fizzle gracefully (card already
          // discarded), rather than forcing an illegal 4th loan.
          clearPrompt(state, playerId);
          events.push(
            event('market_order_unaffordable', `${player.name}'s Market Order fizzles — can't afford ${color} within the loan limit`, {
              actor: playerId,
              payload: { cardUid: target.uid, price }
            })
          );
          return { ok: true, events };
        }
        state.market.splice(mIdx, 1);
        player.hand.push(target);
        payBank(player, price, events);
        adjust(state.stockPrices, color, 1);
        events.push(
          event(
            'market_order_buy',
            `${player.name} buys ${color}${target.name ? ` (${target.name})` : ''} from market for $${price}`,
            { actor: playerId, payload: { cardUid: target.uid, color, price, newPrice: state.stockPrices[color] } }
          )
        );
        clearPrompt(state, playerId);
        resolveStockSpecialOnBuy(state, player, target, events);
        refillMarketIfNeeded(state, events);
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
      // Any hand card may be swapped into the market — stocks, action cards,
      // starter cards, even Insider Tips. Once in the market it is auctioned
      // like any other market card.
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
      const stagedCards = payload.stagedCards as DeckCard[] | undefined;
      const keepCount = payload.keepCount as number;
      if (!keepUids || !Array.isArray(keepUids) || keepUids.length !== keepCount) {
        return { ok: false, error: `must keep exactly ${keepCount}`, events };
      }
      if (!stagedCards) return { ok: false, error: 'staged cards missing', events };
      const kept: DeckCard[] = [];
      const returnedToBottom: DeckCard[] = [];
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

    case 'final_tip_play_choice': {
      const tipUid = payload.tipUid as string;
      const play = response.play as boolean | undefined;
      if (play !== true && play !== false) {
        return { ok: false, error: 'response.play must be boolean', events };
      }
      clearPrompt(state, playerId);
      if (play) {
        const idx = player.hand.findIndex(c => c.uid === tipUid);
        if (idx < 0) {
          // Edge case: tip somehow already gone from hand. Log + proceed.
          events.push(event('error', `final_tip: ${player.name} no longer holds ${tipUid}`, {}));
        } else {
          const tip = player.hand.splice(idx, 1)[0] as InsiderTipCard;
          events.push(
            event('insider_tip_played', `${player.name} plays the final Insider Tip`, {
              actor: playerId,
              payload: { uid: tip.uid, final: true }
            })
          );
          resolveTip(state, tip, events, 'played_from_hand');
        }
      } else {
        events.push(
          event('final_tip_declined', `${player.name} declines to play the final Insider Tip`, {
            actor: playerId,
            payload: { uid: tipUid }
          })
        );
      }
      // Either way, the deck is empty; advance() will end the game.
      return { ok: true, events };
    }
  }
}
