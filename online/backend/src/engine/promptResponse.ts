import type {
  ActionCard,
  Color,
  DeckCard,
  GameLogEntry,
  GameState,
  PlayerId,
  StockCard
} from '@insider-trading/shared';
import { COLORS, maxAffordableSpend } from '@insider-trading/shared';
import type { MutationResult } from '../domain/mutate.js';
import { adjust, setPrice } from '../domain/prices.js';
import { resolveActionEffect } from './actionCards.js';
import { event } from './events.js';
import { clearPrompt, getPrompt, setPrompt } from './prompts.js';
import { handleDraftPick } from './setupDraft.js';
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
      // Peeked the top N event cards; may move ONE of them to the bottom of
      // the deck. No bottomUid = keep them in place. The deck size is
      // unchanged either way, so this never ends the game.
      const bottomUid = response.bottomUid as string | undefined;
      if (bottomUid) {
        const count = payload.count as number;
        const idx = state.eventDeck.findIndex(t => t.uid === bottomUid);
        if (idx < 0 || idx >= count) {
          return { ok: false, error: 'card not among the peeked top cards', events };
        }
        const [card] = state.eventDeck.splice(idx, 1);
        state.eventDeck.push(card);
        clearPrompt(state, playerId);
        events.push(
          event('peek_card_to_bottom', `${player.name} moves an event card to the bottom of the deck`, {
            actor: playerId,
            payload: { uid: card.uid }
          })
        );
      } else {
        clearPrompt(state, playerId);
        events.push(
          event('peek_cards_kept', `${player.name} leaves the peeked event cards in place`, { actor: playerId })
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
      if (mode === 'fire_sale') {
        const target = state.market[mIdx];
        if (target.category !== 'stock' || target.color === 'Wild') {
          return { ok: false, error: 'Fire Sale must buy a colored stock', events };
        }
        const price = 3;
        if (price > maxAffordableSpend(player.cash, player.loans)) {
          clearPrompt(state, playerId);
          events.push(
            event('fire_sale_unaffordable', `${player.name}'s Fire Sale fizzles — can't afford $3 within the loan limit`, {
              actor: playerId
            })
          );
          return { ok: true, events };
        }
        state.market.splice(mIdx, 1);
        player.hand.push(target);
        payBank(player, price, events);
        clearPrompt(state, playerId);
        events.push(
          event(
            'fire_sale_buy',
            `${player.name} buys ${target.color}${target.name ? ` (${target.name})` : ''} via Fire Sale for $3 (no price move, no special ability)`,
            { actor: playerId, payload: { cardUid: target.uid, color: target.color } }
          )
        );
        refillMarketIfNeeded(state, events);
        return { ok: true, events };
      }
      if (mode === 'backroom_deal') {
        const ownCardUid = payload.ownCardUid as string;
        const hIdx = player.hand.findIndex(c => c.uid === ownCardUid);
        if (hIdx < 0) return { ok: false, error: 'your traded card is no longer in hand', events };
        const handCard = player.hand[hIdx];
        if (handCard.category === 'bonus') {
          return { ok: false, error: 'a hidden end-game bonus card cannot be traded away', events };
        }
        const marketCard = state.market[mIdx];
        player.hand[hIdx] = marketCard;
        state.market[mIdx] = handCard;
        clearPrompt(state, playerId);
        events.push(
          event(
            'backroom_deal_resolved',
            `${player.name} trades ${describeCard(handCard)} for ${describeCard(marketCard)} via Backroom Deal`,
            { actor: playerId, payload: { tradedAwayUid: handCard.uid, takenUid: marketCard.uid } }
          )
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
      if (handCard.category === 'bonus') {
        return { ok: false, error: 'a hidden end-game bonus card cannot be swapped', events };
      }
      const marketCard = state.market[mIdx];
      // Any hand card may be swapped into the market — stocks, action cards,
      // starter cards, even private goals or market-movement cards. Once in
      // the market it is auctioned like any other market card.
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

    case 'setup_draft_pick': {
      const keepUid = response.keepUid as string | undefined;
      if (!keepUid) return { ok: false, error: 'keepUid required', events };
      const result = handleDraftPick(state, playerId, keepUid, events);
      if (!result.ok) return { ok: false, error: result.error ?? 'draft pick failed', events };
      return { ok: true, events };
    }

    case 'foresight_reorder': {
      const candidateUids = payload.candidateUids as string[];
      const keepOrder = response.keepOrder as string[] | undefined;
      const buriedUid = response.buriedUid as string | undefined;
      if (!keepOrder || !Array.isArray(keepOrder)) return { ok: false, error: 'keepOrder required', events };
      const expectedKeepLen = buriedUid ? candidateUids.length - 1 : candidateUids.length;
      if (keepOrder.length !== expectedKeepLen) {
        return { ok: false, error: `keepOrder must have ${expectedKeepLen} entries`, events };
      }
      const allUids = buriedUid ? [...keepOrder, buriedUid] : keepOrder;
      if (allUids.slice().sort().join(',') !== candidateUids.slice().sort().join(',')) {
        return { ok: false, error: 'keepOrder/buriedUid must cover exactly the peeked cards', events };
      }
      const topCards = state.eventDeck.splice(0, candidateUids.length);
      const byUid = new Map(topCards.map(c => [c.uid, c]));
      const reordered = keepOrder.map(uid => byUid.get(uid)!);
      state.eventDeck.unshift(...reordered);
      if (buriedUid) {
        state.eventDeck.push(byUid.get(buriedUid)!);
      }
      clearPrompt(state, playerId);
      events.push(
        event(
          'foresight_resolved',
          `${player.name} reorders the top ${candidateUids.length} event cards${buriedUid ? ' and buries one at the bottom' : ''}`,
          { actor: playerId, payload: { keepOrder, buriedUid } }
        )
      );
      return { ok: true, events };
    }

    case 'backroom_deal_pick_own_card': {
      const cardUid = response.cardUid as string | undefined;
      if (!cardUid) return { ok: false, error: 'cardUid required', events };
      const idx = player.hand.findIndex(c => c.uid === cardUid);
      if (idx < 0) return { ok: false, error: 'card not in hand', events };
      if (player.hand[idx].category === 'bonus') {
        return { ok: false, error: 'a hidden end-game bonus card cannot be traded away', events };
      }
      setPrompt(
        state,
        playerId,
        'pick_market_card',
        'Backroom Deal: pick a market card to take in exchange.',
        { mode: 'backroom_deal', ownCardUid: cardUid }
      );
      return { ok: true, events };
    }

    case 'double_down_pick_card': {
      const cardUid = response.cardUid as string | undefined;
      const eligibleUids = payload.eligibleUids as string[];
      if (!cardUid || !eligibleUids.includes(cardUid)) {
        return { ok: false, error: 'cardUid must be one of the eligible cards', events };
      }
      const idx = player.hand.findIndex(c => c.uid === cardUid);
      if (idx < 0) return { ok: false, error: 'card no longer in hand', events };
      const target = player.hand.splice(idx, 1)[0];
      if (target.category !== 'action') return { ok: false, error: 'target is not an action card', events };
      state.discardPile.push(target);
      clearPrompt(state, playerId);
      events.push(
        event('double_down_resolved', `${player.name} doubles ${target.name} via Double Down`, {
          actor: playerId,
          payload: { targetUid: target.uid }
        })
      );
      resolveActionEffect(state, player, target as ActionCard, events);
      resolveActionEffect(state, player, target as ActionCard, events);
      return { ok: true, events };
    }
  }
}
