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
  return createGameState({
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

describe('Action cards', () => {
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
    respondToPrompt(s, 'p1', pr.promptId, { color: 'Yellow', sign: 'down' });
    expect(s.stockPrices.Yellow).toBe(2);
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

  it('Stock Certificate Forgery arms forgery flag', () => {
    const s = mkState();
    const ac = giveActionCard(s, 'p1', 'goal_discount');
    play(s, 'p1', ac);
    expect(s.players[0].forgeryAvailable).toBe(true);
  });

  it('Hostile Takeover: target + stock pick, target gets $6', () => {
    const s = mkState();
    const ac = giveActionCard(s, 'p1', 'steal_stock');
    const stock: StockCard = { ...catalog.stocks.find(x => x.color === 'Purple' && x.type === 'blank')! };
    s.players[1].hand.push(stock);
    const targetBeforeCash = s.players[1].cash;
    play(s, 'p1', ac);
    let pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('pick_target_player');
    respondToPrompt(s, 'p1', pr.promptId, { targetId: 'p2' });
    pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('pick_stock_from_target');
    respondToPrompt(s, 'p1', pr.promptId, { stockUid: stock.uid });
    expect(s.players[0].hand.find(c => c.uid === stock.uid)).toBeTruthy();
    expect(s.players[1].cash).toBe(targetBeforeCash + 6);
  });

  it('Rumor Mill: per-color ±1', () => {
    const s = mkState();
    const ac = giveActionCard(s, 'p1', 'adjust_all_stocks');
    play(s, 'p1', ac);
    const pr = s.pendingPrompts['p1']!;
    expect(pr.payload.perColor).toBe(true);
    respondToPrompt(s, 'p1', pr.promptId, {
      choices: { Blue: 1, Orange: -1, Yellow: 1, Purple: -1 }
    });
    expect(s.stockPrices).toEqual({ Blue: 5, Orange: 3, Yellow: 5, Purple: 3 });
  });

  it('Inside Track / Wiretap: peek + reorder top 2 tips', () => {
    const s = mkState();
    const before = s.insiderTipDeck.slice(0, 2).map(t => t.uid);
    const ac = giveActionCard(s, 'p1', 'peek_reorder_tips');
    play(s, 'p1', ac);
    const pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('reorder_tips');
    // Reverse the order.
    respondToPrompt(s, 'p1', pr.promptId, { order: [before[1], before[0]] });
    expect(s.insiderTipDeck.slice(0, 2).map(t => t.uid)).toEqual([before[1], before[0]]);
  });
});

describe('Hot Tip', () => {
  it('peek + ack discards the Hot Tip', () => {
    const s = mkState();
    expect(s.players[0].hotTipAvailable).toBe(true);
    submitFreeAction(s, 'p1', { kind: 'use_hot_tip' });
    processNextFreeAction(s, []);
    expect(s.players[0].hotTipAvailable).toBe(false);
    const pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('peek_ack');
    respondToPrompt(s, 'p1', pr.promptId, {});
    expect(s.pendingPrompts['p1']).toBeNull();
  });
});

describe('Goal claiming', () => {
  function giveStock(state: GameState, playerId: string, color: Color | 'Wild', n = 1): StockCard[] {
    const out: StockCard[] = [];
    const pool = catalog.stocks.filter(s => s.color === color && s.type === 'blank' || (color === 'Wild' && s.color === 'Wild'));
    for (let i = 0; i < n; i++) {
      const c = { ...pool[i % pool.length], uid: `synthetic-${color}-${Math.random()}` };
      state.players.find(p => p.playerId === playerId)!.hand.push(c);
      out.push(c);
    }
    return out;
  }

  it('claims a 2 Blue goal → +$4', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 1)! };
    s.activeGoals.push(goal);
    const [b1, b2] = giveStock(s, 'p1', 'Blue', 2);
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [b1.uid]: 'Blue', [b2.uid]: 'Blue' } }
    });
    processNextFreeAction(s, []);
    expect(s.players[0].cash).toBe(34);
    expect(s.activeGoals.find(g => g.uid === goal.uid)).toBeUndefined();
    expect(s.players[0].goalsClaimed.find(g => g.uid === goal.uid)).toBeTruthy();
    // Stocks remain in hand.
    expect(s.players[0].hand.find(c => c.uid === b1.uid)).toBeTruthy();
  });

  it('uses Wild Share to substitute one color', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 1)! };
    s.activeGoals.push(goal);
    const [b1] = giveStock(s, 'p1', 'Blue', 1);
    const [w1] = giveStock(s, 'p1', 'Wild', 1);
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [b1.uid]: 'Blue', [w1.uid]: 'Blue' } }
    });
    processNextFreeAction(s, []);
    expect(s.players[0].cash).toBe(34);
    // Wild is discarded after use.
    expect(s.players[0].hand.find(c => c.uid === w1.uid)).toBeUndefined();
    expect(s.discardPile.find(c => c.uid === w1.uid)).toBeTruthy();
  });

  it('Forgery discount: claim 3 Yellow with 2 Yellow', () => {
    const s = mkState();
    s.players[0].forgeryAvailable = true;
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 7)! }; // 3 Yellow → +$7
    s.activeGoals.push(goal);
    const [y1, y2] = giveStock(s, 'p1', 'Yellow', 2);
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      useForgery: true,
      stockAssignment: { cards: { [y1.uid]: 'Yellow', [y2.uid]: 'Yellow' } }
    });
    processNextFreeAction(s, []);
    expect(s.players[0].cash).toBe(37);
    expect(s.players[0].forgeryAvailable).toBe(false);
  });

  it('rejects insufficient stocks', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 1)! };
    s.activeGoals.push(goal);
    const [b1] = giveStock(s, 'p1', 'Blue', 1);
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [b1.uid]: 'Blue' } }
    });
    const events: any[] = [];
    processNextFreeAction(s, events);
    // Goal NOT claimed.
    expect(s.activeGoals.find(g => g.uid === goal.uid)).toBeTruthy();
    expect(events.find(e => e.type === 'error')).toBeTruthy();
  });

  it('reward triggers a prompt: 2 Yellow → set_stock', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 3)! };
    s.activeGoals.push(goal);
    const [y1, y2] = giveStock(s, 'p1', 'Yellow', 2);
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [y1.uid]: 'Yellow', [y2.uid]: 'Yellow' } }
    });
    processNextFreeAction(s, []);
    const pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('set_stock_choice');
    respondToPrompt(s, 'p1', pr.promptId, { color: 'Purple' });
    expect(s.stockPrices.Purple).toBe(6);
  });

  it('end-game cash reward (2 Yellow + 2 Purple → +$10 at end)', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 14)! };
    s.activeGoals.push(goal);
    const [y1, y2] = giveStock(s, 'p1', 'Yellow', 2);
    const [p1, p2] = giveStock(s, 'p1', 'Purple', 2);
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [y1.uid]: 'Yellow', [y2.uid]: 'Yellow', [p1.uid]: 'Purple', [p2.uid]: 'Purple' } }
    });
    processNextFreeAction(s, []);
    expect(s.players[0].endGameCashBonus).toBe(10);
  });

  it('Steal from each other player (3 Blue)', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 5)! };
    s.activeGoals.push(goal);
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
    expect(s.players[0].cash).toBe(30 + 3 + 1); // $3 from Bob, $1 from Carol
    expect(s.players[1].cash).toBe(7);
    expect(s.players[2].cash).toBe(0);
  });
});

describe('end conditions via goal claim', () => {
  it('triggers game_over when activeGoals reduced to 1', () => {
    const s = mkState();
    // Force activeGoals down to 2 so a single claim reduces to 1.
    s.activeGoals = s.activeGoals.slice(0, 2);
    const goal = s.activeGoals[0];
    // Synthesize stocks to satisfy the goal regardless of its requirements.
    for (const [color, count] of Object.entries(goal.goal.parsed.requirements)) {
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
      goalUid: goal.uid,
      stockAssignment: { cards: assignment }
    });
    processNextFreeAction(s, []);
    expect(s.gameOver).not.toBeNull();
    expect(s.gameOver!.reason).toBe('one_goal_remaining');
  });
});
