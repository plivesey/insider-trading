import type {
  ActionCard,
  Color,
  DeckCard,
  GameLogEntry,
  GameState,
  PlayerPrivate,
  StockCard
} from '@insider-trading/shared';
import { COLORS } from '@insider-trading/shared';
import { reshuffleDiscardIfNeeded } from '../domain/deck.js';
import { drawEventCardsIntoHand } from './eventDeck.js';
import { event } from './events.js';
import { describeEventCardForPrompt } from './goals.js';
import { setPrompt } from './prompts.js';
import { nextRng } from './rng.js';
import { describeCard, drawTopOfDeck, receiveBank } from './turn.js';

/**
 * Begin processing a played action card. Persistent cards (Preferred Bidder,
 * the 4 Broker cards) just activate and stay in `persistentEffects` forever
 * -- handled generically here, since activation is identical regardless of
 * which persistent effect it is. Everything else is discarded and its
 * effect resolved via `resolveActionEffect` (also called directly, twice,
 * by Double Down).
 */
export function startActionCard(
  state: GameState,
  player: PlayerPrivate,
  card: ActionCard,
  events: GameLogEntry[]
): void {
  if (card.persistent) {
    player.persistentEffects.push(card);
    events.push(
      event('persistent_activated', `${player.name} activates ${card.name}`, {
        actor: player.playerId,
        payload: { uid: card.uid }
      })
    );
    return;
  }
  state.discardPile.push(card);
  resolveActionEffect(state, player, card, events);
}

/**
 * Resolve a single-use action card's effect. Does NOT touch the discard pile
 * -- the caller (`startActionCard`, or Double Down resolving its target
 * twice) owns that.
 */
export function resolveActionEffect(
  state: GameState,
  player: PlayerPrivate,
  card: ActionCard,
  events: GameLogEntry[]
): void {
  switch (card.effect.type) {
    case 'tie_breaker':
    case 'broker_discount':
      // Persistent effects never reach here -- startActionCard activates
      // them directly. Listed only for switch exhaustiveness.
      return;

    case 'draw_and_choose': {
      const { drawCount, keepCount } = card.effect;
      const rng = nextRng(state);
      if (state.mainDeck.length < drawCount) {
        const reshufflable = state.discardPile.filter(
          (c): c is DeckCard => c.category === 'stock' || c.category === 'action'
        );
        if (reshufflable.length > 0) {
          reshuffleDiscardIfNeeded(state.mainDeck, reshufflable, drawCount, rng);
          state.discardPile = [];
        }
      }
      const drawn = state.mainDeck.splice(0, Math.min(drawCount, state.mainDeck.length));
      if (drawn.length === 0) {
        events.push(event('draw_and_choose_empty', 'No cards left to draw', {}));
        return;
      }
      setPrompt(
        state,
        player.playerId,
        'draw_and_keep',
        `Choose ${keepCount} card${keepCount > 1 ? 's' : ''} to keep; the rest go to the bottom of the deck.`,
        {
          drawn: drawn.map(c => ({ uid: c.uid, summary: describeCard(c), card: c })),
          keepCount,
          sourceUid: card.uid,
          stagedCards: drawn
        }
      );
      return;
    }

    case 'take_face_up': {
      setPrompt(
        state,
        player.playerId,
        'pick_market_card',
        'Corner the Market: pick a face-up market card to take for free (no price move, no ability).',
        { sourceUid: card.uid, freeTake: true }
      );
      return;
    }

    case 'sell_double': {
      const sellable = player.hand.some(c => c.category === 'stock' && c.color !== 'Wild');
      if (!sellable) {
        events.push(
          event(
            'pump_and_dump_no_stock',
            `${player.name} plays Pump and Dump but has no colored stocks to sell — fizzles`,
            { actor: player.playerId }
          )
        );
        return;
      }
      setPrompt(
        state,
        player.playerId,
        'pick_stock_from_hand',
        'Pump and Dump: pick one stock to sell at DOUBLE its current price (color still falls −1).',
        { sourceUid: card.uid, mode: 'pump_and_dump' }
      );
      return;
    }

    case 'sell_same_bonus': {
      const sellable = player.hand.some(c => c.category === 'stock' && c.color !== 'Wild');
      if (!sellable) {
        events.push(
          event(
            'liquidation_no_stock',
            `${player.name} plays Liquidation but has no colored stocks to sell — fizzles`,
            { actor: player.playerId }
          )
        );
        return;
      }
      setPrompt(
        state,
        player.playerId,
        'pick_stock_from_hand',
        `Liquidation: sell any number of stocks of ONE color; gain $${card.effect.bonus} per stock sold (color falls −1 each).`,
        { sourceUid: card.uid, mode: 'sell_same_bonus', bonus: card.effect.bonus, multiple: true }
      );
      return;
    }

    case 'adjust_stock': {
      setPrompt(
        state,
        player.playerId,
        'pick_color_amount',
        `The Squeeze: pick a color and direction (±${card.effect.amount}).`,
        { sourceUid: card.uid, amount: card.effect.amount, allowSign: true }
      );
      return;
    }

    case 'flip_and_adjust': {
      // Wild Speculation: reveal until colored stock or deck cap, then prompt.
      const revealed: (StockCard | ActionCard)[] = [];
      let stockRevealed: StockCard | null = null;
      const maxIter = state.mainDeck.length;
      for (let i = 0; i < maxIter; i++) {
        if (state.mainDeck.length === 0) break;
        const next = state.mainDeck.shift()!;
        revealed.push(next);
        if (next.category === 'stock' && next.color !== 'Wild') {
          stockRevealed = next;
          break;
        }
      }
      state.mainDeck.push(...revealed);
      if (!stockRevealed) {
        events.push(event('wild_speculation_no_stock', 'Wild Speculation: no stock found in deck', {}));
        return;
      }
      events.push(
        event('wild_speculation_revealed', `Wild Speculation revealed ${stockRevealed.color}`, {
          payload: { color: stockRevealed.color }
        })
      );
      setPrompt(
        state,
        player.playerId,
        'wild_speculation_choice',
        `Wild Speculation revealed ${stockRevealed.color}. Adjust ±${card.effect.amount}.`,
        { color: stockRevealed.color, amount: card.effect.amount }
      );
      return;
    }

    case 'steal_stock': {
      setPrompt(
        state,
        player.playerId,
        'pick_target_player',
        'Hostile Takeover: pick a target player.',
        { sourceUid: card.uid }
      );
      return;
    }

    case 'adjust_all_stocks': {
      setPrompt(
        state,
        player.playerId,
        'pick_color_amount',
        `Rumor Mill: adjust EVERY stock by ±${card.effect.amount}. Submit a map of color → ±${card.effect.amount}.`,
        { sourceUid: card.uid, amount: card.effect.amount, perColor: true, colors: COLORS }
      );
      return;
    }

    case 'draw_tip': {
      // Insider Source: draw the top N (default 1) event-deck cards into
      // hand. A market-movement card is playable later as a free action; a
      // goal card is now simply a private goal (privacy is positional).
      const count = card.effect.count ?? 1;
      const drawn = drawEventCardsIntoHand(state, count);
      if (drawn.length === 0) {
        events.push(
          event('insider_source_empty', `${player.name} plays Insider Source but the event deck is empty`, {
            actor: player.playerId
          })
        );
        return;
      }
      for (const d of drawn) player.hand.push(d);
      const kinds = drawn.map(d => (d.category === 'insider_tip' ? 'a market-movement card' : 'a private goal'));
      events.push(
        event('insider_source_drawn', `${player.name} draws ${kinds.join(' and ')} into hand via Insider Source`, {
          actor: player.playerId,
          payload: { uids: drawn.map(d => d.uid), categories: drawn.map(d => d.category) }
        })
      );
      return;
    }

    case 'fire_sale': {
      const hasStock = state.market.some(c => c.category === 'stock' && c.color !== 'Wild');
      if (!hasStock) {
        events.push(
          event('fire_sale_no_stock', `${player.name} plays Fire Sale but the market has no stock — fizzles`, {
            actor: player.playerId
          })
        );
        return;
      }
      setPrompt(
        state,
        player.playerId,
        'pick_market_card',
        'Fire Sale: pick a market stock to buy for a flat $3 (no price move, no special ability).',
        { sourceUid: card.uid, mode: 'fire_sale' }
      );
      return;
    }

    case 'first_look': {
      const drawn = drawTopOfDeck(state, player, events);
      events.push(
        event(
          'first_look_drawn',
          drawn
            ? `${player.name} draws ${describeCard(drawn)} from the market deck via First Look`
            : `${player.name} plays First Look but the market deck is empty`,
          { actor: player.playerId, payload: drawn ? { uid: drawn.uid } : {} }
        )
      );
      return;
    }

    case 'foresight': {
      const top = state.eventDeck.slice(0, 4);
      if (top.length === 0) {
        events.push(event('foresight_empty', `${player.name} plays Foresight but the event deck is empty`, { actor: player.playerId }));
        return;
      }
      setPrompt(
        state,
        player.playerId,
        'foresight_reorder',
        `Foresight: reorder the top ${top.length} event cards, optionally burying one at the bottom.`,
        { candidateUids: top.map(c => c.uid), cards: top.map(describeEventCardForPrompt) }
      );
      return;
    }

    case 'windfall': {
      receiveBank(player, 5);
      events.push(
        event('windfall', `${player.name} gains $5 from Windfall`, {
          actor: player.playerId,
          payload: { newCash: player.cash }
        })
      );
      return;
    }

    case 'market_panic': {
      for (const other of state.players) {
        if (other.playerId === player.playerId) continue;
        const before = other.cash;
        other.cash = Math.max(0, other.cash - 4);
        events.push(
          event('market_panic_hit', `${other.name} loses $${before - other.cash} to Market Panic`, {
            payload: { playerId: other.playerId, newCash: other.cash }
          })
        );
      }
      return;
    }

    case 'backroom_deal': {
      // A hidden end-game bonus card can't be traded away (promptResponse.ts
      // rejects it) -- if that's all the player is holding (or hand is
      // literally empty), there's nothing to trade at all, so fizzle rather
      // than issue a prompt no response can ever satisfy.
      const hasTradeable = player.hand.some(c => c.category !== 'bonus');
      if (!hasTradeable) {
        events.push(
          event('backroom_deal_no_card', `${player.name} plays Backroom Deal but has no tradeable card in hand — fizzles`, {
            actor: player.playerId
          })
        );
        return;
      }
      setPrompt(
        state,
        player.playerId,
        'backroom_deal_pick_own_card',
        'Backroom Deal: pick one of your cards to trade away.',
        { sourceUid: card.uid }
      );
      return;
    }

    case 'double_down': {
      const eligible = player.hand.filter(
        c => c.category === 'action' && !(c as ActionCard).persistent
      );
      if (eligible.length === 0) {
        events.push(
          event(
            'double_down_no_target',
            `${player.name} plays Double Down but has no eligible action card to double — fizzles`,
            { actor: player.playerId }
          )
        );
        return;
      }
      setPrompt(
        state,
        player.playerId,
        'double_down_pick_card',
        'Double Down: pick a different single-use action card in your hand to resolve twice.',
        { eligibleUids: eligible.map(c => c.uid) }
      );
      return;
    }
  }
}
