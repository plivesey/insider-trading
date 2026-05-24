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
import { event } from './events.js';
import { setPrompt } from './prompts.js';
import { checkEndConditions, findPlayer, receiveBank } from './turn.js';

/**
 * Attempt to claim `goalUid` from activeGoals. Validates that the stock
 * assignment satisfies the goal's requirements (with Wild Share substitution
 * and optional Forgery discount), then applies the reward.
 */
export function claimGoal(
  state: GameState,
  player: PlayerPrivate,
  goalUid: string,
  assignment: StockAssignment,
  useForgery: boolean,
  events: GameLogEntry[]
): void {
  const idx = state.activeGoals.findIndex(g => g.uid === goalUid);
  if (idx < 0) {
    events.push(event('error', `claim_goal: goal ${goalUid} not active`, {}));
    return;
  }
  const goal = state.activeGoals[idx];
  const requirements = { ...goal.goal.parsed.requirements };
  let forgeryApplied = false;
  if (useForgery) {
    if (!player.forgeryAvailable) {
      events.push(event('error', `claim_goal: ${player.name} has no Forgery armed`, {}));
      return;
    }
    // Subtract 1 from the largest requirement (or any single requirement).
    const colors = Object.keys(requirements) as Color[];
    if (colors.length === 0) {
      events.push(event('error', 'goal has empty requirements', {}));
      return;
    }
    const target = colors.reduce((a, b) => ((requirements[a] ?? 0) >= (requirements[b] ?? 0) ? a : b));
    requirements[target] = Math.max(1, (requirements[target] ?? 0) - 1);
    forgeryApplied = true;
  }

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

  // All good — discard Wild Shares; reset Forgery if used.
  for (const uid of wildUidsUsed) {
    const wIdx = player.hand.findIndex(c => c.uid === uid);
    if (wIdx >= 0) {
      const w = player.hand.splice(wIdx, 1)[0] as StockCard;
      state.discardPile.push(w);
    }
  }
  if (forgeryApplied) player.forgeryAvailable = false;

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
          wildUsed: wildUidsUsed.length,
          forgeryApplied
        }
      }
    )
  );

  // Apply reward (may set a prompt).
  applyReward(state, player, goal, events);
  // Goal claim may end the game.
  checkEndConditions(state, events);
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
    case 'adjust_all_stocks':
      setPrompt(
        state,
        player.playerId,
        'pick_color_amount',
        `Reward: adjust EVERY stock by ±${r.amount}.`,
        { amount: r.amount, perColor: true, colors: COLORS, goalReward: true }
      );
      return;
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
        'Reward: pick a market card to swap one of your stocks with.',
        { mode: 'swap_with_market_stage1', goalReward: true }
      );
      return;
    case 'sell_bonus_batch':
      setPrompt(
        state,
        player.playerId,
        'pick_stock_from_hand',
        `Reward: sell any number of stocks; gain $${r.bonus} per stock sold (in addition to sale price).`,
        { mode: 'sell_bonus_batch', bonus: r.bonus, multiple: true, goalReward: true }
      );
      return;
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
          drawn: drawn.map(c => ({ uid: c.uid, summary: c.uid, card: c })),
          stagedCards: drawn,
          keepCount: r.keepCount,
          goalReward: true
        }
      );
      return;
    }
  }
}
