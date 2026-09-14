import type {
  Color,
  GameLogEntry,
  GameState,
  GoalCard,
  PlayerPrivate,
  StockAssignment,
  StockCard
} from '@insider-trading/shared';
import { COLORS } from '@insider-trading/shared';
import { adjust } from '../domain/prices.js';
import { event } from './events.js';
import { setPrompt } from './prompts.js';
import { describeCard, findPlayer, receiveBank } from './turn.js';

/**
 * Attempt to claim `goalUid` from activeGoals. Validates that the stock
 * assignment satisfies the goal's requirements (with Wild Share substitution),
 * then applies the reward.
 */
export function claimGoal(
  state: GameState,
  player: PlayerPrivate,
  goalUid: string,
  assignment: StockAssignment,
  events: GameLogEntry[]
): void {
  const idx = state.activeGoals.findIndex(g => g.uid === goalUid);
  if (idx < 0) {
    events.push(event('error', `claim_goal: goal ${goalUid} not active`, {}));
    return;
  }
  const goal = state.activeGoals[idx];
  const requirements = { ...goal.goal.parsed.requirements };

  // Validate stock assignment.
  const cardUids = Object.keys(assignment.cards);
  if (new Set(cardUids).size !== cardUids.length) {
    events.push(event('error', 'duplicate stock assignment', {}));
    return;
  }
  const remaining: Partial<Record<Color, number>> = { ...requirements };
  const wildUidsUsed: string[] = [];
  for (const uid of cardUids) {
    const card = player.hand.find(c => c.uid === uid);
    if (!card || card.category !== 'stock') {
      events.push(event('error', `claim_goal: ${uid} not a stock in hand`, {}));
      return;
    }
    const assignedColor = assignment.cards[uid];
    if (!(COLORS as readonly string[]).includes(assignedColor)) {
      events.push(event('error', `invalid assigned color ${assignedColor}`, {}));
      return;
    }
    if (card.color === 'Wild') {
      wildUidsUsed.push(uid);
    } else if (card.color !== assignedColor) {
      events.push(event('error', `${uid} is ${card.color}, not ${assignedColor}`, {}));
      return;
    }
    remaining[assignedColor] = (remaining[assignedColor] ?? 0) - 1;
  }
  for (const c of Object.keys(remaining) as Color[]) {
    if ((remaining[c] ?? 0) > 0) {
      events.push(event('error', `goal requirement not met: missing ${remaining[c]} ${c}`, {}));
      return;
    }
  }

  // All good — discard Wild Shares.
  for (const uid of wildUidsUsed) {
    const wIdx = player.hand.findIndex(c => c.uid === uid);
    if (wIdx >= 0) {
      const w = player.hand.splice(wIdx, 1)[0] as StockCard;
      state.discardPile.push(w);
    }
  }

  // Remove goal from active, add to player's claimed list.
  state.activeGoals.splice(idx, 1);
  player.goalsClaimed.push(goal);
  events.push(
    event(
      'goal_claimed',
      `${player.name} claims "${goal.goal.text}" (reward: ${goal.reward.text})`,
      {
        actor: player.playerId,
        payload: {
          goalUid,
          goalText: goal.goal.text,
          rewardText: goal.reward.text,
          wildUsed: wildUidsUsed.length
        }
      }
    )
  );

  // Apply reward (may set a prompt). End-condition check is deferred to
  // advance(); if the reward sets a prompt the player needs to resolve it
  // *before* the game ends, otherwise the reward is lost.
  applyReward(state, player, goal, events);
}

function applyReward(
  state: GameState,
  player: PlayerPrivate,
  goal: GoalCard,
  events: GameLogEntry[]
): void {
  const r = goal.reward.parsed;
  switch (r.type) {
    case 'gain_cash':
      receiveBank(player, r.amount);
      events.push(
        event('reward_cash', `${player.name} gains $${r.amount}`, {
          actor: player.playerId,
          payload: { amount: r.amount, newCash: player.cash }
        })
      );
      return;
    case 'end_game_cash':
      player.endGameCashBonus += r.amount;
      events.push(
        event('reward_endgame_cash', `${player.name} will gain $${r.amount} at end of game`, {
          actor: player.playerId,
          payload: { amount: r.amount }
        })
      );
      return;
    case 'steal_from_all': {
      let stolen = 0;
      for (const other of state.players) {
        if (other.playerId === player.playerId) continue;
        const take = Math.min(other.cash, r.amount);
        other.cash -= take;
        player.cash += take;
        stolen += take;
        events.push(
          event(
            'reward_steal',
            `${player.name} steals $${take} from ${other.name}`,
            { actor: player.playerId, payload: { from: other.playerId, amount: take } }
          )
        );
      }
      return;
    }
    case 'adjust_stock':
      setPrompt(
        state,
        player.playerId,
        'pick_color_amount',
        `Reward: adjust one stock by ±${r.amount}.`,
        { amount: r.amount, allowSign: true, goalReward: true }
      );
      return;
    case 'set_stock':
      setPrompt(
        state,
        player.playerId,
        'set_stock_choice',
        `Reward: set any one stock to exactly $${r.amount}.`,
        { amount: r.amount, goalReward: true }
      );
      return;
    case 'peek_tips': {
      const n = Math.min(r.count, state.insiderTipDeck.length);
      const top = state.insiderTipDeck.slice(0, n);
      setPrompt(
        state,
        player.playerId,
        'peek_ack',
        `Reward: peek at top ${n} Insider Tip${n > 1 ? 's' : ''}.`,
        { tips: top.map(t => ({ text: t.text, type: t.type })) }
      );
      return;
    }
    case 'peek_tips_bottom': {
      const n = Math.min(r.count, state.insiderTipDeck.length);
      if (n === 0) {
        events.push(
          event('reward_peek_empty', `${player.name}'s peek reward: the Insider Tip deck is empty`, {
            actor: player.playerId
          })
        );
        return;
      }
      const top = state.insiderTipDeck.slice(0, n);
      setPrompt(
        state,
        player.playerId,
        'peek_bottom_choice',
        `Reward: peek at the top ${n} Insider Tip${n > 1 ? 's' : ''}; you may move one to the bottom of the deck.`,
        {
          tips: top.map(t => ({ uid: t.uid, text: t.text, type: t.type })),
          count: n,
          goalReward: true
        }
      );
      return;
    }
    case 'adjust_all_stocks':
      setPrompt(
        state,
        player.playerId,
        'pick_color_amount',
        `Reward: adjust EVERY stock by ±${r.amount}.`,
        { amount: r.amount, perColor: true, colors: COLORS, goalReward: true }
      );
      return;
    case 'draw_tips': {
      // Draw up to `count` tips from the unused pool into the player's hand;
      // they can be played later as free actions (like Insider Source).
      const n = Math.min(r.count, state.unusedInsiderTipPool.length);
      const drawn = state.unusedInsiderTipPool.splice(0, n);
      player.hand.push(...drawn);
      events.push(
        event(
          'reward_draw_tips',
          `${player.name} draws ${n} Insider Tip${n === 1 ? '' : 's'} into hand`,
          { actor: player.playerId, payload: { count: n, uids: drawn.map(t => t.uid) } }
        )
      );
      return;
    }
    case 'adjust_two_stocks':
      setPrompt(
        state,
        player.playerId,
        'adjust_two_stocks_choice',
        `Reward: raise one stock by +${r.up} and lower another by −${r.down}.`,
        { up: r.up, down: r.down, goalReward: true }
      );
      return;
    case 'swap_with_market':
      setPrompt(
        state,
        player.playerId,
        'pick_market_card',
        'Reward: pick a market card to swap one of your cards with.',
        { mode: 'swap_with_market_stage1', goalReward: true }
      );
      return;
    case 'sell_bonus_batch': {
      // Sell EVERY colored stock in hand at once. Each stock pays its color's
      // current price + bonus; all payouts use pre-batch prices (so a color's
      // price doesn't cannibalize its own sales). Price drops (−1 per stock
      // sold) are applied only AFTER the whole batch. Wild Shares can't be sold.
      const toSell = player.hand.filter(
        (c): c is StockCard => c.category === 'stock' && (c as StockCard).color !== 'Wild'
      );
      if (toSell.length === 0) {
        events.push(
          event('sell_bonus_none', `${player.name} has no stocks to sell for the reward`, {
            actor: player.playerId
          })
        );
        return;
      }
      const soldByColor: Partial<Record<Color, number>> = {};
      let total = 0;
      for (const card of toSell) {
        const color = card.color as Color;
        const payout = state.stockPrices[color] + r.bonus; // pre-batch price
        receiveBank(player, payout);
        total += payout;
        soldByColor[color] = (soldByColor[color] ?? 0) + 1;
        const hIdx = player.hand.findIndex(c => c.uid === card.uid);
        if (hIdx >= 0) player.hand.splice(hIdx, 1);
        state.discardPile.push(card);
      }
      // Apply all price drops after the batch resolves.
      for (const color of Object.keys(soldByColor) as Color[]) {
        adjust(state.stockPrices, color, -(soldByColor[color] ?? 0));
      }
      events.push(
        event(
          'sell_bonus_batch_all',
          `${player.name} sells ${toSell.length} stock${toSell.length === 1 ? '' : 's'} for $${total} total (+$${r.bonus} each); prices drop after the batch`,
          { actor: player.playerId, payload: { count: toSell.length, total, bonus: r.bonus, soldByColor } }
        )
      );
      return;
    }
    case 'draw_deck_tip': {
      // Draw the top Insider Tip from the DECK (not the unused pool) into hand,
      // then gain cash. Drawing the deck's last tip empties it, which ends the
      // game via advance()'s end-condition check; the drawn tip stays in hand
      // unresolved (same as Insider Source). Wilds/cash apply immediately.
      const tip = state.insiderTipDeck.shift();
      if (tip) {
        player.hand.push(tip);
        events.push(
          event('reward_draw_deck_tip', `${player.name} draws the top Insider Tip from the deck into hand`, {
            actor: player.playerId,
            payload: { uid: tip.uid, wasLast: state.insiderTipDeck.length === 0 }
          })
        );
      } else {
        events.push(
          event('reward_draw_deck_tip_empty', `${player.name}'s reward: the Insider Tip deck is empty`, {
            actor: player.playerId
          })
        );
      }
      receiveBank(player, r.cash);
      events.push(
        event('reward_cash', `${player.name} gains $${r.cash}`, {
          actor: player.playerId,
          payload: { amount: r.cash, newCash: player.cash }
        })
      );
      return;
    }
    case 'draw_and_choose': {
      // Pull `drawCount` from main deck and prompt player to keep `keepCount`.
      const drawn = state.mainDeck.splice(0, Math.min(r.drawCount, state.mainDeck.length));
      if (drawn.length === 0) return;
      setPrompt(
        state,
        player.playerId,
        'draw_and_keep',
        `Reward: choose ${r.keepCount} to keep, return the rest to the bottom.`,
        {
          drawn: drawn.map(c => ({ uid: c.uid, summary: describeCard(c), card: c })),
          stagedCards: drawn,
          keepCount: r.keepCount,
          goalReward: true
        }
      );
      return;
    }
  }
}
