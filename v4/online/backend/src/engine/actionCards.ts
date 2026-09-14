import type {
  ActionCard,
  Color,
  GameLogEntry,
  GameState,
  PlayerPrivate,
  StockCard,
  HandCard
} from '@insider-trading/shared';
import { COLORS } from '@insider-trading/shared';
import { adjust, setPrice } from '../domain/prices.js';
import { reshuffleDiscardIfNeeded } from '../domain/deck.js';
import { event } from './events.js';
import { setPrompt } from './prompts.js';
import { nextRng } from './rng.js';
import { describeCard } from './turn.js';

/**
 * Begin processing a played action card. Most cards set a prompt awaiting
 * player input; some resolve immediately. Persistent cards go to
 * persistentEffects. The played card otherwise goes to the discard pile
 * (unless explicitly removed from game).
 */
export function startActionCard(
  state: GameState,
  player: PlayerPrivate,
  card: ActionCard,
  events: GameLogEntry[]
): void {
  switch (card.effect.type) {
    case 'tie_breaker': {
      // Persistent: move to persistentEffects rather than discard.
      player.persistentEffects.push(card);
      events.push(
        event('persistent_activated', `${player.name} activates Preferred Bidder`, {
          actor: player.playerId,
          payload: { uid: card.uid }
        })
      );
      return;
    }
    case 'draw_and_choose': {
      const { drawCount, keepCount } = card.effect;
      const rng = nextRng(state);
      // Ensure we have enough cards.
      if (state.mainDeck.length < drawCount) {
        const reshufflable = state.discardPile.filter(
          (c): c is import('@insider-trading/shared').DeckCard =>
            c.category === 'stock' || c.category === 'action'
        );
        if (reshufflable.length > 0) {
          reshuffleDiscardIfNeeded(state.mainDeck, reshufflable, drawCount, rng);
          state.discardPile = state.discardPile.filter(c => c.category === 'hot_tip');
        }
      }
      const drawn = state.mainDeck.splice(0, Math.min(drawCount, state.mainDeck.length));
      state.discardPile.push(card);
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
          stagedUids: drawn.map(c => c.uid)
        }
      );
      // Park drawn cards on the player's hand temporarily — they'll move based
      // on response. Simpler: keep them inside the prompt payload.
      // We'll use payload.stagedCards to resolve.
      (state.pendingPrompts[player.playerId]!.payload as any).stagedCards = drawn;
      return;
    }
    case 'take_face_up': {
      state.discardPile.push(card);
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
      state.discardPile.push(card);
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
      state.discardPile.push(card);
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
      state.discardPile.push(card);
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
      state.discardPile.push(card);
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
      // All revealed cards go to the bottom regardless.
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
      state.discardPile.push(card);
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
      state.discardPile.push(card);
      setPrompt(
        state,
        player.playerId,
        'pick_color_amount',
        `Rumor Mill: adjust EVERY stock by ±${card.effect.amount}. Submit a map of color → ±${card.effect.amount}.`,
        { sourceUid: card.uid, amount: card.effect.amount, perColor: true, colors: COLORS }
      );
      return;
    }
    case 'auction_unused_tip': {
      // Black Market triggers from the market on reveal, not from a player's
      // hand. If somehow this card ends up being played from hand (shouldn't
      // happen — it's removed from the game on trigger), log and discard.
      state.discardPile.push(card);
      events.push(
        event(
          'black_market_in_hand_noop',
          `${player.name} plays Black Market from hand — no effect`,
          { actor: player.playerId, payload: { uid: card.uid } }
        )
      );
      return;
    }
    case 'draw_tip': {
      state.discardPile.push(card);
      if (state.insiderTipDeck.length === 0) {
        // Shouldn't happen — game would have ended — but guard anyway.
        events.push(
          event('insider_source_empty', `${player.name} plays Insider Source but the tip deck is empty`, {
            actor: player.playerId
          })
        );
        return;
      }
      const tip = state.insiderTipDeck.shift()!;
      player.hand.push(tip);
      const wasLast = state.insiderTipDeck.length === 0;
      events.push(
        event('insider_tip_drawn', `${player.name} draws an Insider Tip into hand`, {
          actor: player.playerId,
          payload: { uid: tip.uid, wasLast }
        })
      );
      if (wasLast) {
        // Drawing the last tip empties the deck, which triggers game end. Give
        // the drawer one chance to play (resolve) it first.
        setPrompt(
          state,
          player.playerId,
          'final_tip_play_choice',
          `Insider Source drew the LAST Insider Tip. Play "${tip.text}" now (resolves it) or decline — either way the game ends.`,
          { tipUid: tip.uid, tipText: tip.text, tipType: tip.type }
        );
      }
      return;
    }
    case 'buy_from_market': {
      // Market Order: buy one colored stock from the market at its current
      // price (the buy itself raises that color +1). The card is consumed
      // whether or not a buy completes; if the market has no colored stock, it
      // fizzles. Resolution happens on the pick_market_card response.
      state.discardPile.push(card);
      const hasColoredStock = state.market.some(
        c => c.category === 'stock' && c.color !== 'Wild'
      );
      if (!hasColoredStock) {
        events.push(
          event('market_order_no_stock', `${player.name} plays Market Order but the market has no colored stock — fizzles`, {
            actor: player.playerId,
            payload: { uid: card.uid }
          })
        );
        return;
      }
      setPrompt(
        state,
        player.playerId,
        'pick_market_card',
        'Market Order: pick a market stock to buy at its current price.',
        { sourceUid: card.uid, mode: 'buy_from_market' }
      );
      return;
    }
    case 'peek_top_tip': {
      // Hot Tip: peek at the top Insider Tip. Single-use — the card is removed
      // from the game (not discarded) once played.
      const top = state.insiderTipDeck[0];
      events.push(
        event('hot_tip_used', `${player.name} uses Hot Tip`, {
          actor: player.playerId,
          payload: top ? { tip: { text: top.text, type: top.type } } : { empty: true }
        })
      );
      if (top) {
        setPrompt(
          state,
          player.playerId,
          'peek_ack',
          `Hot Tip: top Insider Tip is "${top.text}". Acknowledge to continue.`,
          { tip: { text: top.text, type: top.type } }
        );
      }
      return;
    }
  }
}
