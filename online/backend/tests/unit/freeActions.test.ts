import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards, type GameState, type ActionCard, type GoalCard, type Color, type StockCard, type HandCard } from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { submitFreeAction, processNextFreeAction } from '../../src/engine/freeActions.js';
import { respondToPrompt } from '../../src/engine/promptResponse.js';
import { advance } from '../../src/engine/advance.js';
import { currentPlayer } from '../../src/engine/turn.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');
const catalog = loadCards(CARDS_DIR);

function mkState(seed = 1): GameState {
  const state = createGameState({
    catalog,
    players: [
      { playerId: 'p1', name: 'Alice' },
      { playerId: 'p2', name: 'Bob' },
      { playerId: 'p3', name: 'Carol' }
    ],
    seed,
    gameId: 'g',
    startedAt: '2026-01-01T00:00:00.000Z'
  });
  state.turnPhase = 'awaiting_turn_action';
  return state;
}

function actionByEffect(type: string): ActionCard {
  return catalog.actions.find(a => a.effect.type === type)!;
}

function giveActionCard(state: GameState, playerId: string, effectType: string): ActionCard {
  const ac = structuredClone(actionByEffect(effectType));
  state.players.find(p => p.playerId === playerId)!.hand.push(ac);
  return ac;
}

function play(state: GameState, playerId: string, ac: ActionCard) {
  submitFreeAction(state, playerId, { kind: 'play_action_card', cardUid: ac.uid });
  processNextFreeAction(state, []);
}

describe('Action cards (carried over from V4, unchanged mechanics)', () => {
  it('Tipster\'s Choice draws 2, prompts to keep 1', () => {
    const s = mkState();
    const ac = giveActionCard(s, 'p1', 'draw_and_choose');
    play(s, 'p1', ac);
    const pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('draw_and_keep');
    const drawn = pr.payload.drawn as { uid: string }[];
    expect(drawn).toHaveLength(2);
    const keep = drawn[0].uid;
    const before = s.players[0].hand.length;
    respondToPrompt(s, 'p1', pr.promptId, { keepUids: [keep] });
    expect(s.players[0].hand.find(c => c.uid === keep)).toBeTruthy();
    expect(s.players[0].hand.length).toBe(before + 1);
  });

  it('Corner the Market: pick market card, no price move', () => {
    const s = mkState();
    const ac = giveActionCard(s, 'p1', 'take_face_up');
    const before = { ...s.stockPrices };
    play(s, 'p1', ac);
    const pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('pick_market_card');
    const card = s.market[0];
    respondToPrompt(s, 'p1', pr.promptId, { cardUid: card.uid });
    expect(s.players[0].hand.find(c => c.uid === card.uid)).toBeTruthy();
    expect(s.stockPrices).toEqual(before);
    expect(s.market).toHaveLength(5); // refilled
  });

  it('Pump and Dump: sells at 2x, color -1', () => {
    const s = mkState();
    const ac = giveActionCard(s, 'p1', 'sell_double');
    const stock: StockCard = { ...catalog.stocks.find(x => x.color === 'Blue' && x.type === 'blank')! };
    s.players[0].hand.push(stock);
    const beforeCash = s.players[0].cash;
    const beforePrice = s.stockPrices.Blue;
    play(s, 'p1', ac);
    const pr = s.pendingPrompts['p1']!;
    respondToPrompt(s, 'p1', pr.promptId, { stockUid: stock.uid });
    expect(s.players[0].cash).toBe(beforeCash + beforePrice * 2);
    expect(s.stockPrices.Blue).toBe(beforePrice - 1);
  });

  it('The Squeeze: ±2 on chosen color', () => {
    const s = mkState();
    const ac = giveActionCard(s, 'p1', 'adjust_stock');
    play(s, 'p1', ac);
    const pr = s.pendingPrompts['p1']!;
    expect(pr.payload.amount).toBe(2);
    respondToPrompt(s, 'p1', pr.promptId, { color: 'Green', sign: 'down' });
    expect(s.stockPrices.Green).toBe(2);
  });

  it('Wild Speculation: prompts for ±3 on revealed color', () => {
    const s = mkState();
    const ac = giveActionCard(s, 'p1', 'flip_and_adjust');
    play(s, 'p1', ac);
    const pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('wild_speculation_choice');
    const revealedColor = pr.payload.color as Color;
    const before = s.stockPrices[revealedColor];
    respondToPrompt(s, 'p1', pr.promptId, { sign: 'up' });
    expect(s.stockPrices[revealedColor]).toBe(before + 3);
  });

  it('Preferred Bidder is persistent', () => {
    const s = mkState();
    const ac = giveActionCard(s, 'p1', 'tie_breaker');
    play(s, 'p1', ac);
    expect(s.pendingPrompts['p1']).toBeNull();
    expect(s.players[0].persistentEffects.find(c => c.uid === ac.uid)).toBeTruthy();
  });

  it('a Broker card is persistent too', () => {
    const s = mkState();
    const ac = giveActionCard(s, 'p1', 'broker_discount');
    play(s, 'p1', ac);
    expect(s.pendingPrompts['p1']).toBeNull();
    expect(s.players[0].persistentEffects.find(c => c.uid === ac.uid)).toBeTruthy();
    expect(s.discardPile.find(c => c.uid === ac.uid)).toBeUndefined();
  });

  it('Hostile Takeover: target + stock pick, target draws top of deck', () => {
    const s = mkState();
    const ac = giveActionCard(s, 'p1', 'steal_stock');
    const stock: StockCard = { ...catalog.stocks.find(x => x.color === 'Purple' && x.type === 'blank')! };
    s.players[1].hand.push(stock);
    const targetBeforeCash = s.players[1].cash;
    const deckTop = s.mainDeck[0];
    const targetHandBefore = s.players[1].hand.length;
    play(s, 'p1', ac);
    let pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('pick_target_player');
    respondToPrompt(s, 'p1', pr.promptId, { targetId: 'p2' });
    pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('pick_stock_from_target');
    respondToPrompt(s, 'p1', pr.promptId, { stockUid: stock.uid });
    expect(s.players[0].hand.find(c => c.uid === stock.uid)).toBeTruthy();
    // No cash compensation; target instead drew the top deck card.
    expect(s.players[1].cash).toBe(targetBeforeCash);
    expect(s.players[1].hand.find(c => c.uid === deckTop.uid)).toBeTruthy();
    // Lost the stolen stock (-1) but gained the deck draw (+1) → net unchanged.
    expect(s.players[1].hand.length).toBe(targetHandBefore);
    expect(s.mainDeck.find(c => c.uid === deckTop.uid)).toBeUndefined();
  });

  it('Rumor Mill: per-color ±1', () => {
    const s = mkState();
    const ac = giveActionCard(s, 'p1', 'adjust_all_stocks');
    play(s, 'p1', ac);
    const pr = s.pendingPrompts['p1']!;
    expect(pr.payload.perColor).toBe(true);
    respondToPrompt(s, 'p1', pr.promptId, {
      choices: { Blue: 1, Orange: -1, Green: 1, Purple: -1 }
    });
    expect(s.stockPrices).toEqual({ Blue: 5, Orange: 3, Green: 5, Purple: 3 });
  });

  it('Insider Source: draws top event-deck card into hand, deck shrinks by 1', () => {
    const s = mkState();
    const topBefore = s.eventDeck[0];
    const sizeBefore = s.eventDeck.length;
    const ac = giveActionCard(s, 'p1', 'draw_tip');
    play(s, 'p1', ac);
    expect(s.eventDeck.length).toBe(sizeBefore - 1);
    expect(s.eventDeck.find(t => t.uid === topBefore.uid)).toBeUndefined();
    expect(s.players[0].hand.find(c => c.uid === topBefore.uid)).toBeTruthy();
  });

  it('Insider Source: if the drawn card is a market-movement card, playing it from hand resolves its effect and bumps the progress tracker', () => {
    const s = mkState();
    // Force the top of the event deck to be a market-movement card.
    const tip = s.eventDeck.find(c => c.category === 'insider_tip')!;
    s.eventDeck = [tip, ...s.eventDeck.filter(c => c.uid !== tip.uid)];
    const ac = giveActionCard(s, 'p1', 'draw_tip');
    const trackerBefore = s.progressTracker;
    play(s, 'p1', ac);
    const drawn = s.players[0].hand.find(c => c.uid === tip.uid)!;
    const beforePrices = { ...s.stockPrices };
    submitFreeAction(s, 'p1', { kind: 'play_market_movement', cardUid: drawn.uid });
    processNextFreeAction(s, []);
    expect(s.players[0].hand.find(c => c.uid === drawn.uid)).toBeUndefined();
    expect(s.resolvedEventCards.find(t => t.uid === drawn.uid)).toBeTruthy();
    expect(s.stockPrices).not.toEqual(beforePrices);
    expect(s.progressTracker).toBe(trackerBefore + 1);
  });

  it('Insider Source: if the drawn card is a goal card, it becomes a new private goal', () => {
    const s = mkState();
    const goal = s.eventDeck.find(c => c.category === 'goal')!;
    s.eventDeck = [goal, ...s.eventDeck.filter(c => c.uid !== goal.uid)];
    const ac = giveActionCard(s, 'p1', 'draw_tip');
    play(s, 'p1', ac);
    const drawn = s.players[0].hand.find(c => c.uid === goal.uid);
    expect(drawn).toBeTruthy();
    expect(drawn!.category).toBe('goal');
    // It's private: not in the public goal row.
    expect(s.goalRow.find(g => g.uid === goal.uid)).toBeUndefined();
  });
});

describe('Liquidation (sell_same_bonus) pricing', () => {
  it('sells every stock in the batch at the same price, dropping price once per stock at the end', () => {
    const s = mkState();
    const me = currentPlayer(s);
    s.stockPrices.Blue = 8;
    const b1 = structuredClone(catalog.stocks.find(c => c.color === 'Blue' && c.type === 'blank')!) as StockCard;
    const b2 = structuredClone(catalog.stocks.find(c => c.color === 'Blue' && c.type === 'blank')!) as StockCard;
    b1.uid = 'blue-1';
    b2.uid = 'blue-2';
    me.hand.push(b1 as HandCard, b2 as HandCard);
    const cashBefore = me.cash;

    const ac = giveActionCard(s, me.playerId, 'sell_same_bonus');
    play(s, me.playerId, ac);

    const pr = s.pendingPrompts[me.playerId]!;
    expect(pr.type).toBe('pick_stock_from_hand');
    // First Blue: price ticks down to 7, but the batch payout stays locked at 8.
    respondToPrompt(s, me.playerId, pr.promptId, { stockUid: 'blue-1' });
    expect(s.stockPrices.Blue).toBe(7);
    // Second Blue + end the batch: still paid the opening price of $8.
    respondToPrompt(s, me.playerId, pr.promptId, { stockUid: 'blue-2', done: true });

    // Both sold at $8 + $1 bonus = $9 each (not $8 then $7).
    expect(me.cash).toBe(cashBefore + 9 + 9);
    // −1 per stock: 8 − 2 = 6.
    expect(s.stockPrices.Blue).toBe(6);
    expect(s.pendingPrompts[me.playerId]).toBeNull();
  });
});

describe('Goal claiming (public)', () => {
  function giveStock(state: GameState, playerId: string, color: Color | 'Wild', n = 1): StockCard[] {
    const out: StockCard[] = [];
    const pool = catalog.stocks.filter(s => (s.color === color && s.type === 'blank') || (color === 'Wild' && s.color === 'Wild'));
    for (let i = 0; i < n; i++) {
      const c = { ...pool[i % pool.length], uid: `synthetic-${color}-${Math.random()}` };
      state.players.find(p => p.playerId === playerId)!.hand.push(c);
      out.push(c);
    }
    return out;
  }

  it('claims a 2 Blue goal → +$4, bumps the progress tracker', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 1)! };
    s.goalRow.push(goal);
    const trackerBefore = s.progressTracker;
    const cashBefore = s.players[0].cash;
    const [b1, b2] = giveStock(s, 'p1', 'Blue', 2);
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [b1.uid]: 'Blue', [b2.uid]: 'Blue' } }
    });
    processNextFreeAction(s, []);
    expect(s.players[0].cash).toBe(cashBefore + 4);
    expect(s.goalRow.find(g => g.uid === goal.uid)).toBeUndefined();
    expect(s.players[0].goalsClaimed.find(g => g.uid === goal.uid)).toBeTruthy();
    expect(s.progressTracker).toBe(trackerBefore + 1);
    // Stocks remain in hand.
    expect(s.players[0].hand.find(c => c.uid === b1.uid)).toBeTruthy();
  });

  it('uses Wild Share to substitute one color', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 1)! };
    s.goalRow.push(goal);
    const cashBefore = s.players[0].cash;
    const [b1] = giveStock(s, 'p1', 'Blue', 1);
    const [w1] = giveStock(s, 'p1', 'Wild', 1);
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [b1.uid]: 'Blue', [w1.uid]: 'Blue' } }
    });
    processNextFreeAction(s, []);
    expect(s.players[0].cash).toBe(cashBefore + 4);
    // Wild is discarded after use.
    expect(s.players[0].hand.find(c => c.uid === w1.uid)).toBeUndefined();
    expect(s.discardPile.find(c => c.uid === w1.uid)).toBeTruthy();
  });

  it('rejects insufficient stocks', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 1)! };
    s.goalRow.push(goal);
    const [b1] = giveStock(s, 'p1', 'Blue', 1);
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [b1.uid]: 'Blue' } }
    });
    const events: any[] = [];
    processNextFreeAction(s, events);
    // Goal NOT claimed.
    expect(s.goalRow.find(g => g.uid === goal.uid)).toBeTruthy();
    expect(events.find(e => e.type === 'error')).toBeTruthy();
  });

  it('reward triggers a prompt: 2 Green → set_stock', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 3)! };
    s.goalRow.push(goal);
    const [g1, g2] = giveStock(s, 'p1', 'Green', 2);
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [g1.uid]: 'Green', [g2.uid]: 'Green' } }
    });
    processNextFreeAction(s, []);
    const pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('set_stock_choice');
    respondToPrompt(s, 'p1', pr.promptId, { color: 'Purple' });
    expect(s.stockPrices.Purple).toBe(6);
  });

  it('end-game cash reward (2 Green + 2 Purple → +$11 at end)', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 14)! };
    s.goalRow.push(goal);
    const [g1, g2] = giveStock(s, 'p1', 'Green', 2);
    const [p1, p2] = giveStock(s, 'p1', 'Purple', 2);
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [g1.uid]: 'Green', [g2.uid]: 'Green', [p1.uid]: 'Purple', [p2.uid]: 'Purple' } }
    });
    processNextFreeAction(s, []);
    expect(s.players[0].endGameCashBonus).toBe(11);
  });

  it('Steal from each other player (3 Blue)', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 5)! };
    s.goalRow.push(goal);
    const cashBefore = s.players[0].cash;
    const stocks = giveStock(s, 'p1', 'Blue', 3);
    s.players[1].cash = 10;
    s.players[2].cash = 1; // only $1 to give
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: {
        cards: { [stocks[0].uid]: 'Blue', [stocks[1].uid]: 'Blue', [stocks[2].uid]: 'Blue' }
      }
    });
    processNextFreeAction(s, []);
    expect(s.players[0].cash).toBe(cashBefore + 2 + 1); // $2 from Bob, $1 from Carol
    expect(s.players[1].cash).toBe(8);
    expect(s.players[2].cash).toBe(0);
  });
});

describe('Goal claiming (private)', () => {
  function giveStock(state: GameState, playerId: string, color: Color, n = 1): StockCard[] {
    const out: StockCard[] = [];
    const pool = catalog.stocks.filter(s => s.color === color && s.type === 'blank');
    for (let i = 0; i < n; i++) {
      const c = { ...pool[i % pool.length], uid: `priv-${color}-${Math.random()}` };
      state.players.find(p => p.playerId === playerId)!.hand.push(c);
      out.push(c);
    }
    return out;
  }

  it('reveals and claims a private goal from hand, removing it and bumping the tracker', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 1)! }; // 2 Blue -> +$4
    s.players[0].hand.push(goal);
    const trackerBefore = s.progressTracker;
    const cashBefore = s.players[0].cash;
    const [b1, b2] = giveStock(s, 'p1', 'Blue', 2);
    submitFreeAction(s, 'p1', {
      kind: 'claim_private_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [b1.uid]: 'Blue', [b2.uid]: 'Blue' } }
    });
    processNextFreeAction(s, []);
    expect(s.players[0].hand.find(c => c.uid === goal.uid)).toBeUndefined();
    expect(s.players[0].goalsClaimed.find(g => g.uid === goal.uid)).toBeTruthy();
    expect(s.players[0].cash).toBe(cashBefore + 4);
    expect(s.progressTracker).toBe(trackerBefore + 1);
    // Never appeared in the public row.
    expect(s.goalRow.find(g => g.uid === goal.uid)).toBeUndefined();
  });

  it('rejects claiming a private goal that is not in hand', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 1)! };
    // Note: NOT pushed into anyone's hand.
    const events: any[] = [];
    submitFreeAction(s, 'p1', {
      kind: 'claim_private_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: {} }
    });
    processNextFreeAction(s, events);
    expect(events.find(e => e.type === 'error')).toBeTruthy();
  });
});

describe('end conditions via progress tracker', () => {
  it('claiming a goal that pushes the tracker to the threshold ends the game (no-prompt reward)', () => {
    const s = mkState();
    s.progressTracker = s.progressThreshold - 1;
    const noPromptGoal: GoalCard = {
      ...catalog.goals.find(g => g.reward.parsed.type === 'gain_cash')!
    };
    s.goalRow.push(noPromptGoal);
    for (const [color, count] of Object.entries(noPromptGoal.goal.parsed.requirements)) {
      for (let i = 0; i < (count as number); i++) {
        const c = { ...catalog.stocks.find(x => x.color === color && x.type === 'blank')! };
        c.uid = `auto-${color}-${i}-${Math.random()}`;
        s.players[0].hand.push(c);
      }
    }
    const assignment: Record<string, Color> = {};
    for (const c of s.players[0].hand) {
      if (c.category === 'stock' && c.color !== 'Wild') {
        assignment[c.uid] = c.color;
      }
    }
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: noPromptGoal.uid,
      stockAssignment: { cards: assignment }
    });
    advance(s, []);
    expect(s.gameOver).not.toBeNull();
    expect(s.gameOver!.reason).toBe('progress_threshold_reached');
  });

  it('defers game_over until an open reward prompt is resolved', () => {
    const s = mkState();
    s.progressTracker = s.progressThreshold - 1;
    const goal: GoalCard = {
      ...catalog.goals.find(g => g.reward.parsed.type === 'adjust_stock')!
    };
    s.goalRow.push(goal);
    for (const [color, count] of Object.entries(goal.goal.parsed.requirements)) {
      for (let i = 0; i < (count as number); i++) {
        const c = { ...catalog.stocks.find(x => x.color === color && x.type === 'blank')! };
        c.uid = `defer-${color}-${i}-${Math.random()}`;
        s.players[0].hand.push(c);
      }
    }
    const assignment: Record<string, Color> = {};
    for (const c of s.players[0].hand) {
      if (c.category === 'stock' && c.color !== 'Wild') {
        assignment[c.uid] = c.color;
      }
    }
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: assignment }
    });
    advance(s, []);
    // The reward prompt should be open, and the game must still be running
    // even though the tracker already hit the threshold at claim time.
    const pr = s.pendingPrompts['p1']!;
    expect(pr).not.toBeNull();
    expect(pr.type).toBe('pick_color_amount');
    expect(s.gameOver).toBeNull();
    expect(s.progressTracker).toBe(s.progressThreshold);
    // Resolve the prompt — only now should the game end.
    respondToPrompt(s, 'p1', pr.promptId, { color: 'Blue', sign: 'up' });
    advance(s, []);
    expect(s.gameOver).not.toBeNull();
    expect(s.gameOver!.reason).toBe('progress_threshold_reached');
  });
});
