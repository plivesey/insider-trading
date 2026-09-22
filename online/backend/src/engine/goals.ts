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
import { drawEventCardsIntoHand } from './eventDeck.js';
import { event } from './events.js';
import { setPrompt } from './prompts.js';
import { describeCard, receiveBank } from './turn.js';

/**
 * Validate that `assignment` (stock uid -> assigned color) satisfies
 * `requirements`, with Wild Shares standing in for any one missing color.
 * On success, discards the Wild Shares used and returns true. Pushes an
 * `error` event and returns false on any validation failure -- no state is
 * mutated in that case.
 */
function validateAndConsumeStockAssignment(
  state: GameState,
  player: PlayerPrivate,
  requirements: Partial<Record<Color, number>>,
  assignment: StockAssignment,
  events: GameLogEntry[]
): boolean {
  const cardUids = Object.keys(assignment.cards);
  if (new Set(cardUids).size !== cardUids.length) {
    events.push(event('error', 'duplicate stock assignment', {}));
    return false;
  }
  const remaining: Partial<Record<Color, number>> = { ...requirements };
  const wildUidsUsed: string[] = [];
  for (const uid of cardUids) {
    const card = player.hand.find(c => c.uid === uid);
    if (!card || card.category !== 'stock') {
      events.push(event('error', `claim: ${uid} not a stock in hand`, {}));
      return false;
    }
    const assignedColor = assignment.cards[uid];
    if (!(COLORS as readonly string[]).includes(assignedColor)) {
      events.push(event('error', `invalid assigned color ${assignedColor}`, {}));
      return false;
    }
    if (card.color === 'Wild') {
      wildUidsUsed.push(uid);
    } else if (card.color !== assignedColor) {
      events.push(event('error', `${uid} is ${card.color}, not ${assignedColor}`, {}));
      return false;
    }
    remaining[assignedColor] = (remaining[assignedColor] ?? 0) - 1;
  }
  for (const c of Object.keys(remaining) as Color[]) {
    if ((remaining[c] ?? 0) > 0) {
      events.push(event('error', `goal requirement not met: missing ${remaining[c]} ${c}`, {}));
      return false;
    }
  }
  for (const uid of wildUidsUsed) {
    const wIdx = player.hand.findIndex(c => c.uid === uid);
    if (wIdx >= 0) {
      const w = player.hand.splice(wIdx, 1)[0] as StockCard;
      state.discardPile.push(w);
    }
  }
  return true;
}

/** Attempt to claim `goalUid` from the public goal row. */
export function claimGoal(
  state: GameState,
  player: PlayerPrivate,
  goalUid: string,
  assignment: StockAssignment,
  events: GameLogEntry[]
): void {
  const idx = state.goalRow.findIndex(g => g.uid === goalUid);
  if (idx < 0) {
    events.push(event('error', `claim_goal: goal ${goalUid} not in the public goal row`, {}));
    return;
  }
  const goal = state.goalRow[idx];
  if (!validateAndConsumeStockAssignment(state, player, goal.goal.parsed.requirements, assignment, events)) {
    return;
  }
  state.goalRow.splice(idx, 1);
  player.goalsClaimed.push(goal);
  state.progressTracker += 1;
  events.push(
    event('goal_claimed', `${player.name} claims "${goal.goal.text}" (reward: ${goal.reward.text})`, {
      actor: player.playerId,
      payload: {
        goalUid,
        goalText: goal.goal.text,
        rewardText: goal.reward.text,
        progressTracker: state.progressTracker
      }
    })
  );
  applyReward(state, player, goal, events);
}

/** Attempt to reveal-and-claim a private goal sitting in the player's own hand. */
export function claimPrivateGoal(
  state: GameState,
  player: PlayerPrivate,
  goalUid: string,
  assignment: StockAssignment,
  events: GameLogEntry[]
): void {
  const idx = player.hand.findIndex(c => c.uid === goalUid && c.category === 'goal');
  if (idx < 0) {
    events.push(event('error', `claim_private_goal: ${player.name} does not hold private goal ${goalUid}`, {}));
    return;
  }
  const goal = player.hand[idx] as GoalCard;
  if (!validateAndConsumeStockAssignment(state, player, goal.goal.parsed.requirements, assignment, events)) {
    return;
  }
  // A used Wild Share may have shifted indices -- re-locate the goal by uid.
  const gIdx = player.hand.findIndex(c => c.uid === goalUid);
  if (gIdx >= 0) player.hand.splice(gIdx, 1);
  player.goalsClaimed.push(goal);
  state.progressTracker += 1;
  events.push(
    event(
      'private_goal_claimed',
      `${player.name} reveals and claims a private goal: "${goal.goal.text}" (reward: ${goal.reward.text})`,
      {
        actor: player.playerId,
        payload: {
          goalUid,
          goalText: goal.goal.text,
          rewardText: goal.reward.text,
          progressTracker: state.progressTracker
        }
      }
    )
  );
  applyReward(state, player, goal, events);
}

/** Find a valid stock assignment for `requirements` from `player`'s hand, or null if unsatisfiable. */
export function autoSatisfyAssignment(
  player: PlayerPrivate,
  requirements: Partial<Record<Color, number>>
): StockAssignment | null {
  const availableByColor: Partial<Record<Color, string[]>> = {};
  const wildUids: string[] = [];
  for (const c of player.hand) {
    if (c.category !== 'stock') continue;
    if (c.color === 'Wild') {
      wildUids.push(c.uid);
    } else {
      const list = availableByColor[c.color] ?? (availableByColor[c.color] = []);
      list.push(c.uid);
    }
  }
  const cards: Record<string, Color> = {};
  let wildIdx = 0;
  for (const [color, count] of Object.entries(requirements) as [Color, number][]) {
    let need = count ?? 0;
    const pool = availableByColor[color] ?? [];
    while (need > 0 && pool.length > 0) {
      cards[pool.shift()!] = color;
      need -= 1;
    }
    while (need > 0 && wildIdx < wildUids.length) {
      cards[wildUids[wildIdx]] = color;
      wildIdx += 1;
      need -= 1;
    }
    if (need > 0) return null;
  }
  return { cards };
}

/**
 * Called immediately after a new goal enters the public goal row (setup
 * reveal or a dice draw). If 2+ players can already satisfy it right now,
 * it's a rare simultaneous-claim: set the goal aside, pay ALL qualifying
 * players, and bump the tracker once (not once per player). If 0 or exactly
 * 1 player qualifies, do nothing -- claiming stays optional/manual via the
 * normal free action, at any pace, for anyone (including that 1 player).
 */
export function checkSimultaneousGoalClaims(state: GameState, goal: GoalCard, events: GameLogEntry[]): void {
  const qualifying: { player: PlayerPrivate; assignment: StockAssignment }[] = [];
  for (const player of state.players) {
    const assignment = autoSatisfyAssignment(player, goal.goal.parsed.requirements);
    if (assignment) qualifying.push({ player, assignment });
  }
  if (qualifying.length < 2) return;
  const idx = state.goalRow.findIndex(g => g.uid === goal.uid);
  if (idx < 0) return;
  state.goalRow.splice(idx, 1);
  state.progressTracker += 1;
  events.push(
    event(
      'goal_simultaneous_claim',
      `${qualifying.length} players can already satisfy the newly-revealed goal "${goal.goal.text}" -- all of them claim it`,
      {
        payload: {
          goalUid: goal.uid,
          playerIds: qualifying.map(q => q.player.playerId),
          progressTracker: state.progressTracker
        }
      }
    )
  );
  for (const { player, assignment } of qualifying) {
    validateAndConsumeStockAssignment(state, player, goal.goal.parsed.requirements, assignment, events);
    player.goalsClaimed.push(goal);
    events.push(
      event(
        'goal_claimed',
        `${player.name} claims "${goal.goal.text}" (simultaneous reveal; reward: ${goal.reward.text})`,
        { actor: player.playerId, payload: { goalUid: goal.uid, goalText: goal.goal.text, rewardText: goal.reward.text } }
      )
    );
    applyReward(state, player, goal, events);
  }
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
      const n = Math.min(r.count, state.eventDeck.length);
      const top = state.eventDeck.slice(0, n);
      setPrompt(
        state,
        player.playerId,
        'peek_ack',
        `Reward: peek at the top ${n} event card${n === 1 ? '' : 's'}.`,
        { cards: top.map(describeEventCardForPrompt) }
      );
      return;
    }
    case 'peek_tips_bottom': {
      const n = Math.min(r.count, state.eventDeck.length);
      if (n === 0) {
        events.push(
          event('reward_peek_empty', `${player.name}'s peek reward: the event deck is empty`, {
            actor: player.playerId
          })
        );
        return;
      }
      const top = state.eventDeck.slice(0, n);
      setPrompt(
        state,
        player.playerId,
        'peek_bottom_choice',
        `Reward: peek at the top ${n} event card${n === 1 ? '' : 's'}; you may move one to the bottom of the deck.`,
        { cards: top.map(describeEventCardForPrompt), count: n, goalReward: true }
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
      // Draw up to `count` cards from the top of the event deck into hand.
      // A market-movement card can be played later as a free action; a goal
      // card drawn this way is simply a new private goal.
      const drawn = drawEventCardsIntoHand(state, r.count);
      player.hand.push(...drawn);
      events.push(
        event(
          'reward_draw_event_cards',
          `${player.name} draws ${drawn.length} card${drawn.length === 1 ? '' : 's'} from the event deck into hand`,
          { actor: player.playerId, payload: { count: drawn.length, uids: drawn.map(t => t.uid) } }
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
      // Opt-in: the player may sell any number (including zero) of their
      // colored stocks, one at a time, each paying its price + bonus. Routes
      // into the same iterative pick_stock_from_hand/'sell_bonus_batch' mode
      // already used by the Liquidation action card's sibling 'sell_same_bonus'
      // mode -- the prompt handler, bot decision logic, and frontend all
      // already support this mode; only this reward case needed to start it.
      const canSell = player.hand.some(
        c => c.category === 'stock' && (c as StockCard).color !== 'Wild'
      );
      if (!canSell) {
        events.push(
          event('sell_bonus_none', `${player.name} has no stocks to sell for the reward`, {
            actor: player.playerId
          })
        );
        return;
      }
      setPrompt(
        state,
        player.playerId,
        'pick_stock_from_hand',
        `Reward: sell any number of your stocks for +$${r.bonus} each (send done when finished).`,
        { mode: 'sell_bonus_batch', bonus: r.bonus, goalReward: true }
      );
      return;
    }
    case 'draw_deck_tip': {
      // Draw the top card of the event deck into hand, then gain cash.
      const [drawn] = drawEventCardsIntoHand(state, 1);
      if (drawn) {
        player.hand.push(drawn);
        events.push(
          event('reward_draw_deck_tip', `${player.name} draws the top event card into hand`, {
            actor: player.playerId,
            payload: { uid: drawn.uid }
          })
        );
      } else {
        events.push(
          event('reward_draw_deck_tip_empty', `${player.name}'s reward: the event deck is empty`, {
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
    case 'draw_deck_tip_adjust': {
      // Same draw-into-hand half as draw_deck_tip, but no cash -- followed by
      // the same generic pick_color_amount prompt adjust_stock already uses.
      const [drawn] = drawEventCardsIntoHand(state, 1);
      if (drawn) {
        player.hand.push(drawn);
        events.push(
          event('reward_draw_deck_tip', `${player.name} draws the top event card into hand`, {
            actor: player.playerId,
            payload: { uid: drawn.uid }
          })
        );
      } else {
        events.push(
          event('reward_draw_deck_tip_empty', `${player.name}'s reward: the event deck is empty`, {
            actor: player.playerId
          })
        );
      }
      setPrompt(
        state,
        player.playerId,
        'pick_color_amount',
        `Reward: adjust one stock by ±${r.amount}.`,
        { amount: r.amount, allowSign: true, goalReward: true }
      );
      return;
    }
    case 'gain_cash_adjust': {
      // Flat cash grant, then the same generic pick_color_amount prompt
      // adjust_stock already uses.
      receiveBank(player, r.cash);
      events.push(
        event('reward_cash', `${player.name} gains $${r.cash}`, {
          actor: player.playerId,
          payload: { amount: r.cash, newCash: player.cash }
        })
      );
      setPrompt(
        state,
        player.playerId,
        'pick_color_amount',
        `Reward: adjust one stock by ±${r.amount}.`,
        { amount: r.amount, allowSign: true, goalReward: true }
      );
      return;
    }
    case 'draw_and_choose': {
      // Pull `drawCount` from the market deck and prompt player to keep `keepCount`.
      // The deck may hold fewer than drawCount cards (rare, but possible late
      // in a game) -- clamp keepCount to however many actually got drawn, or
      // the prompt would demand more picks than exist and could never resolve.
      const drawn = state.mainDeck.splice(0, Math.min(r.drawCount, state.mainDeck.length));
      if (drawn.length === 0) return;
      const keepCount = Math.min(r.keepCount, drawn.length);
      setPrompt(
        state,
        player.playerId,
        'draw_and_keep',
        `Reward: choose ${keepCount} to keep, return the rest to the bottom.`,
        {
          drawn: drawn.map(c => ({ uid: c.uid, summary: describeCard(c), card: c })),
          stagedCards: drawn,
          keepCount,
          goalReward: true
        }
      );
      return;
    }
    case 'draw_and_choose_tips': {
      // Same shape as draw_and_choose, but pulls from the top of the event
      // deck (not the main deck) and returns the un-kept cards to the TOP of
      // the event deck (not the bottom of the main deck) -- see the
      // returnTarget branch in promptResponse.ts's draw_and_keep handler.
      // The event deck is far smaller than the main deck and depletes over
      // the course of a game, so running short here is common enough to hit
      // in practice, not just a theoretical edge case -- same keepCount clamp
      // as draw_and_choose above.
      const drawn = drawEventCardsIntoHand(state, r.drawCount);
      if (drawn.length === 0) return;
      const keepCount = Math.min(r.keepCount, drawn.length);
      setPrompt(
        state,
        player.playerId,
        'draw_and_keep',
        `Reward: choose ${keepCount} to keep, return the rest to the top of the event deck.`,
        {
          drawn: drawn.map(c => ({ uid: c.uid, summary: describeEventCardForPrompt(c), card: c })),
          stagedCards: drawn,
          keepCount,
          returnTarget: 'eventDeck_top',
          goalReward: true
        }
      );
      return;
    }
  }
}

/** Summarize an event-deck card (market-movement or goal) for a peek prompt payload. */
export function describeEventCardForPrompt(card: { category: string }): Record<string, unknown> {
  if (card.category === 'insider_tip') {
    const t = card as import('@insider-trading/shared').InsiderTipCard;
    return { uid: t.uid, kind: 'market_movement', text: t.text, type: t.type };
  }
  const g = card as GoalCard;
  return { uid: g.uid, kind: 'goal', text: `${g.goal.text} → ${g.reward.text}` };
}

export interface FinalGoalOffer {
  playerId: string;
  goalUid: string;
  isPrivate: boolean;
  goalText: string;
  rewardText: string;
}

/**
 * Scan every player for a goal (public or private) they can complete right
 * now, for the end-of-game "claim before scoring" offer (rules.md: the game
 * shouldn't end mid-turn and cut a player off from a goal their own auction
 * just made claimable). At most one offer per player -- public goals checked
 * first, then private -- to keep the final round bounded and simple.
 */
export function collectFinalGoalOffers(state: GameState): FinalGoalOffer[] {
  const offers: FinalGoalOffer[] = [];
  for (const player of state.players) {
    for (const goal of state.goalRow) {
      if (autoSatisfyAssignment(player, goal.goal.parsed.requirements)) {
        offers.push({
          playerId: player.playerId,
          goalUid: goal.uid,
          isPrivate: false,
          goalText: goal.goal.text,
          rewardText: goal.reward.text
        });
        break;
      }
    }
  }
  for (const player of state.players) {
    if (offers.some(o => o.playerId === player.playerId)) continue;
    for (const card of player.hand) {
      if (card.category !== 'goal') continue;
      if (autoSatisfyAssignment(player, card.goal.parsed.requirements)) {
        offers.push({
          playerId: player.playerId,
          goalUid: card.uid,
          isPrivate: true,
          goalText: card.goal.text,
          rewardText: card.reward.text
        });
        break;
      }
    }
  }
  return offers;
}
