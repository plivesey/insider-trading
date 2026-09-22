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
  // Tests push their own specific goal(s) onto goalRow and assert on exactly
  // those uids -- clear the setup-time public goal reveal so a coincidental
  // uid collision with a manually-pushed goal (dependent on seed + deck
  // composition, and therefore not stable across unrelated card changes)
  // can't make a push/splice look like a no-op.
  state.goalRow = [];
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

let syntheticId = 0;
/**
 * Tipster's Choice / The Squeeze / Wild Speculation no longer exist as real
 * cards (removed from action_cards.json), but their dispatch logic in
 * `resolveActionEffect` is still valid, reachable code -- construct a
 * synthetic card directly instead of sourcing it from the catalog.
 */
function syntheticActionCard(state: GameState, playerId: string, effect: ActionCard['effect']): ActionCard {
  syntheticId += 1;
  const ac: ActionCard = {
    category: 'action',
    uid: `synthetic-action-${syntheticId}`,
    id: -syntheticId,
    name: `Synthetic ${effect.type}`,
    description: '',
    persistent: false,
    effect
  };
  state.players.find(p => p.playerId === playerId)!.hand.push(ac);
  return ac;
}

function play(state: GameState, playerId: string, ac: ActionCard) {
  submitFreeAction(state, playerId, { kind: 'play_action_card', cardUid: ac.uid });
  processNextFreeAction(state, []);
}

describe('Action cards (carried over from V4, unchanged mechanics)', () => {
  it('Tipster\'s Choice draws 2, prompts to keep 1 (removed from the pool, dispatch logic still covered)', () => {
    const s = mkState();
    const ac = syntheticActionCard(s, 'p1', { type: 'draw_and_choose', drawCount: 2, keepCount: 1 });
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

  it('The Squeeze: ±2 on chosen color (removed from the pool, dispatch logic still covered)', () => {
    const s = mkState();
    const ac = syntheticActionCard(s, 'p1', { type: 'adjust_stock', amount: 2 });
    play(s, 'p1', ac);
    const pr = s.pendingPrompts['p1']!;
    expect(pr.payload.amount).toBe(2);
    respondToPrompt(s, 'p1', pr.promptId, { color: 'Green', sign: 'down' });
    expect(s.stockPrices.Green).toBe(2);
  });

  it('Wild Speculation: prompts for ±3 on revealed color (removed from the pool, dispatch logic still covered)', () => {
    const s = mkState();
    const ac = syntheticActionCard(s, 'p1', { type: 'flip_and_adjust', amount: 3 });
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

  it('Insider Source: draws top 2 event-deck cards into hand, deck shrinks by 2', () => {
    const s = mkState();
    const top2Before = s.eventDeck.slice(0, 2);
    const sizeBefore = s.eventDeck.length;
    const ac = giveActionCard(s, 'p1', 'draw_tip');
    expect(ac.effect).toEqual({ type: 'draw_tip', count: 2 });
    play(s, 'p1', ac);
    expect(s.eventDeck.length).toBe(sizeBefore - 2);
    for (const card of top2Before) {
      expect(s.eventDeck.find(t => t.uid === card.uid)).toBeUndefined();
      expect(s.players[0].hand.find(c => c.uid === card.uid)).toBeTruthy();
    }
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

  it('claims a 2 Purple goal → +$4, bumps the progress tracker', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 4)! };
    s.goalRow.push(goal);
    const trackerBefore = s.progressTracker;
    const cashBefore = s.players[0].cash;
    const [p1, p2] = giveStock(s, 'p1', 'Purple', 2);
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [p1.uid]: 'Purple', [p2.uid]: 'Purple' } }
    });
    processNextFreeAction(s, []);
    expect(s.players[0].cash).toBe(cashBefore + 4);
    expect(s.goalRow.find(g => g.uid === goal.uid)).toBeUndefined();
    expect(s.players[0].goalsClaimed.find(g => g.uid === goal.uid)).toBeTruthy();
    expect(s.progressTracker).toBe(trackerBefore + 1);
    // Stocks remain in hand.
    expect(s.players[0].hand.find(c => c.uid === p1.uid)).toBeTruthy();
  });

  it('uses Wild Share to substitute one color', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 4)! };
    s.goalRow.push(goal);
    const cashBefore = s.players[0].cash;
    const [p1] = giveStock(s, 'p1', 'Purple', 1);
    const [w1] = giveStock(s, 'p1', 'Wild', 1);
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [p1.uid]: 'Purple', [w1.uid]: 'Purple' } }
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

  it('reward triggers a prompt: 2 Green → draw 3 event cards, keep 1, return the other 2 to the event deck top', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 3)! };
    s.goalRow.push(goal);
    const [g1, g2] = giveStock(s, 'p1', 'Green', 2);
    const tip1 = { ...catalog.insiderTips[0], uid: 'tip-fixture-1' };
    const tip2 = { ...catalog.insiderTips[1], uid: 'tip-fixture-2' };
    const tip3 = { ...catalog.insiderTips[2], uid: 'tip-fixture-3' };
    s.eventDeck = [tip1, tip2, tip3, ...s.eventDeck];
    const deckLenBefore = s.eventDeck.length;
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [g1.uid]: 'Green', [g2.uid]: 'Green' } }
    });
    processNextFreeAction(s, []);
    const pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('draw_and_keep');
    expect(pr.payload.keepCount).toBe(1);
    expect(pr.payload.returnTarget).toBe('eventDeck_top');
    const staged = pr.payload.stagedCards as { uid: string }[];
    expect(staged.map(c => c.uid)).toEqual([tip1.uid, tip2.uid, tip3.uid]);
    respondToPrompt(s, 'p1', pr.promptId, { keepUids: [tip1.uid] });
    expect(s.players[0].hand.find(c => c.uid === tip1.uid)).toBeTruthy();
    // The 2 un-kept cards go back to the TOP of the event deck (3 drawn, 1 kept, 2 returned).
    expect(s.eventDeck[0]?.uid).toBe(tip2.uid);
    expect(s.eventDeck[1]?.uid).toBe(tip3.uid);
    expect(s.eventDeck.length).toBe(deckLenBefore - 1);
  });

  it('draw-deck-tip reward (2 Green + 2 Purple → draw top tip into hand and gain $6)', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 14)! };
    s.goalRow.push(goal);
    const [g1, g2] = giveStock(s, 'p1', 'Green', 2);
    const [p1, p2] = giveStock(s, 'p1', 'Purple', 2);
    const tip1 = { ...catalog.insiderTips[0], uid: 'tip-fixture-14' };
    s.eventDeck = [tip1, ...s.eventDeck];
    const cashBefore = s.players[0].cash;
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [g1.uid]: 'Green', [g2.uid]: 'Green', [p1.uid]: 'Purple', [p2.uid]: 'Purple' } }
    });
    processNextFreeAction(s, []);
    expect(s.players[0].hand.find(c => c.uid === tip1.uid)).toBeTruthy();
    expect(s.players[0].cash).toBe(cashBefore + 6);
  });

  it('end-game cash reward (2 Blue + 2 Purple → +$12 at end)', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 11)! };
    s.goalRow.push(goal);
    const [b1, b2] = giveStock(s, 'p1', 'Blue', 2);
    const [p1, p2] = giveStock(s, 'p1', 'Purple', 2);
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [b1.uid]: 'Blue', [b2.uid]: 'Blue', [p1.uid]: 'Purple', [p2.uid]: 'Purple' } }
    });
    processNextFreeAction(s, []);
    expect(s.players[0].endGameCashBonus).toBe(12);
  });

  it('Steal $1 from each other player (2 Blue)', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 1)! };
    s.goalRow.push(goal);
    const cashBefore = s.players[0].cash;
    const stocks = giveStock(s, 'p1', 'Blue', 2);
    s.players[1].cash = 10;
    s.players[2].cash = 0; // nothing to give
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [stocks[0].uid]: 'Blue', [stocks[1].uid]: 'Blue' } }
    });
    processNextFreeAction(s, []);
    expect(s.players[0].cash).toBe(cashBefore + 1 + 0); // $1 from Bob, $0 from Carol (broke)
    expect(s.players[1].cash).toBe(9);
    expect(s.players[2].cash).toBe(0);
  });

  it('Steal $2 from each other player (3 Blue)', () => {
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
    expect(s.players[0].cash).toBe(cashBefore + 2 + 1); // $2 from Bob, $1 from Carol (capped)
    expect(s.players[1].cash).toBe(8);
    expect(s.players[2].cash).toBe(0);
  });

  it('Swap one of your cards for a market card (2 Blue + 2 Green)', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 10)! };
    s.goalRow.push(goal);
    const [b1, b2] = giveStock(s, 'p1', 'Blue', 2);
    const [g1, g2] = giveStock(s, 'p1', 'Green', 2);
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [b1.uid]: 'Blue', [b2.uid]: 'Blue', [g1.uid]: 'Green', [g2.uid]: 'Green' } }
    });
    processNextFreeAction(s, []);
    let pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('pick_market_card');
    expect(pr.payload.mode).toBe('swap_with_market_stage1');
    const marketCard = s.market[0];
    respondToPrompt(s, 'p1', pr.promptId, { cardUid: marketCard.uid });
    pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('pick_hand_stock_for_swap');
    const handStockUid = b1.uid; // claimed stocks stay in hand, eligible to swap away
    respondToPrompt(s, 'p1', pr.promptId, { stockUid: handStockUid });
    expect(s.players[0].hand.find(c => c.uid === marketCard.uid)).toBeTruthy();
    expect(s.players[0].hand.find(c => c.uid === handStockUid)).toBeUndefined();
    expect(s.market.find(c => c.uid === handStockUid)).toBeTruthy();
    expect(s.market.find(c => c.uid === marketCard.uid)).toBeUndefined();
  });

  it('opt-in sell reward (3 Orange): can sell some and the prompt stays open until done', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 6)! };
    s.goalRow.push(goal);
    const orangeStocks = giveStock(s, 'p1', 'Orange', 3);
    const [extra] = giveStock(s, 'p1', 'Green', 1); // an extra, non-claim stock left in hand to sell
    const cashBefore = s.players[0].cash;
    const priceBefore = s.stockPrices.Green;
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: {
        cards: { [orangeStocks[0].uid]: 'Orange', [orangeStocks[1].uid]: 'Orange', [orangeStocks[2].uid]: 'Orange' }
      }
    });
    processNextFreeAction(s, []);
    let pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('pick_stock_from_hand');
    expect(pr.payload.mode).toBe('sell_bonus_batch');
    expect(pr.payload.bonus).toBe(3);
    // Sell the extra stock -- the prompt stays open (no `done` sent).
    respondToPrompt(s, 'p1', pr.promptId, { stockUid: extra.uid });
    expect(s.players[0].cash).toBe(cashBefore + priceBefore + 3);
    pr = s.pendingPrompts['p1']!;
    expect(pr).toBeTruthy();
    expect(pr.type).toBe('pick_stock_from_hand');
    // Now opt out.
    respondToPrompt(s, 'p1', pr.promptId, { done: true });
    expect(s.pendingPrompts['p1']).toBeNull();
    // The 3 claimed Orange stocks remain in hand -- claiming a goal never sells your stock.
    for (const c of orangeStocks) {
      expect(s.players[0].hand.find(h => h.uid === c.uid)).toBeTruthy();
    }
  });

  it('opt-in sell reward: responding done immediately with no sales sells nothing', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 6)! };
    s.goalRow.push(goal);
    const orangeStocks = giveStock(s, 'p1', 'Orange', 3);
    const cashBefore = s.players[0].cash;
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: {
        cards: { [orangeStocks[0].uid]: 'Orange', [orangeStocks[1].uid]: 'Orange', [orangeStocks[2].uid]: 'Orange' }
      }
    });
    processNextFreeAction(s, []);
    const pr = s.pendingPrompts['p1']!;
    respondToPrompt(s, 'p1', pr.promptId, { done: true });
    expect(s.players[0].cash).toBe(cashBefore);
    expect(s.pendingPrompts['p1']).toBeNull();
  });

  it('draw-tip-then-adjust reward (2 Orange + 2 Green): draws a tip immediately, then prompts to adjust a stock', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 12)! };
    s.goalRow.push(goal);
    const [o1, o2] = giveStock(s, 'p1', 'Orange', 2);
    const [g1, g2] = giveStock(s, 'p1', 'Green', 2);
    const tip1 = { ...catalog.insiderTips[0], uid: 'tip-fixture-12' };
    s.eventDeck = [tip1, ...s.eventDeck];
    const cashBefore = s.players[0].cash;
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [o1.uid]: 'Orange', [o2.uid]: 'Orange', [g1.uid]: 'Green', [g2.uid]: 'Green' } }
    });
    processNextFreeAction(s, []);
    // Draw happened immediately, no cash change.
    expect(s.players[0].hand.find(c => c.uid === tip1.uid)).toBeTruthy();
    expect(s.players[0].cash).toBe(cashBefore);
    const pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('pick_color_amount');
    expect(pr.payload.amount).toBe(2);
    respondToPrompt(s, 'p1', pr.promptId, { color: 'Purple', sign: 'up' });
    expect(s.stockPrices.Purple).toBe(6);
  });

  it('cash-then-adjust reward (2 Orange + 2 Purple): gains $4 immediately, then prompts to adjust a stock', () => {
    const s = mkState();
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 13)! };
    s.goalRow.push(goal);
    const [o1, o2] = giveStock(s, 'p1', 'Orange', 2);
    const [p1, p2] = giveStock(s, 'p1', 'Purple', 2);
    const cashBefore = s.players[0].cash;
    submitFreeAction(s, 'p1', {
      kind: 'claim_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [o1.uid]: 'Orange', [o2.uid]: 'Orange', [p1.uid]: 'Purple', [p2.uid]: 'Purple' } }
    });
    processNextFreeAction(s, []);
    expect(s.players[0].cash).toBe(cashBefore + 4);
    const pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('pick_color_amount');
    expect(pr.payload.amount).toBe(2);
    respondToPrompt(s, 'p1', pr.promptId, { color: 'Green', sign: 'down' });
    expect(s.stockPrices.Green).toBe(2);
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
    const goal: GoalCard = { ...catalog.goals.find(g => g.id === 4)! }; // 2 Purple -> +$4
    s.players[0].hand.push(goal);
    const trackerBefore = s.progressTracker;
    const cashBefore = s.players[0].cash;
    const [b1, b2] = giveStock(s, 'p1', 'Purple', 2);
    submitFreeAction(s, 'p1', {
      kind: 'claim_private_goal',
      goalUid: goal.uid,
      stockAssignment: { cards: { [b1.uid]: 'Purple', [b2.uid]: 'Purple' } }
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
    // Threshold reached mid-turn (still awaiting_turn_action) must not end the
    // game yet -- the claiming player's turn plays out normally first.
    expect(s.gameOver).toBeNull();
    // Once the turn actually completes, the game ends.
    s.turnPhase = 'turn_complete';
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
    // Resolve the prompt — the game still shouldn't end here: the claiming
    // player's turn (still awaiting_turn_action) hasn't completed yet.
    respondToPrompt(s, 'p1', pr.promptId, { color: 'Blue', sign: 'up' });
    advance(s, []);
    expect(s.gameOver).toBeNull();
    // Once the turn actually completes, the game ends.
    s.turnPhase = 'turn_complete';
    advance(s, []);
    expect(s.gameOver).not.toBeNull();
    expect(s.gameOver!.reason).toBe('progress_threshold_reached');
  });
});

describe('final goal offer at game end', () => {
  function giveGoalStock(s: GameState, playerIdx: number, goal: GoalCard, tag: string) {
    for (const [color, count] of Object.entries(goal.goal.parsed.requirements)) {
      for (let i = 0; i < (count as number); i++) {
        const c = { ...catalog.stocks.find(x => x.color === color && x.type === 'blank')! };
        c.uid = `${tag}-${color}-${i}-${Math.random()}`;
        s.players[playerIdx].hand.push(c);
      }
    }
  }

  it('offers a claimable goal instead of ending immediately, then finalizes once accepted', () => {
    const s = mkState();
    s.progressTracker = s.progressThreshold;
    const goal: GoalCard = { ...catalog.goals.find(g => g.reward.parsed.type === 'gain_cash')! };
    s.goalRow.push(goal);
    giveGoalStock(s, 1, goal, 'offer'); // p2, not the current player

    s.turnPhase = 'turn_complete';
    advance(s, []);

    // Not over yet -- p2 gets offered the goal their (implicit) auction just made claimable.
    expect(s.gameOver).toBeNull();
    expect(s.turnPhase).toBe('game_ending');
    const pr = s.pendingPrompts['p2'];
    expect(pr?.type).toBe('final_goal_offer');
    expect(pr?.payload.goalUid).toBe(goal.uid);

    respondToPrompt(s, 'p2', pr!.promptId, { claim: true });
    advance(s, []);

    expect(s.players[1].goalsClaimed.some(g => g.uid === goal.uid)).toBe(true);
    expect(s.gameOver).not.toBeNull();
  });

  it('finalizes immediately when nobody can currently claim a goal', () => {
    const s = mkState();
    s.progressTracker = s.progressThreshold;
    s.turnPhase = 'turn_complete';
    advance(s, []);
    expect(s.gameOver).not.toBeNull();
  });

  it('finalizes once the offer is declined, without claiming it', () => {
    const s = mkState();
    s.progressTracker = s.progressThreshold;
    const goal: GoalCard = { ...catalog.goals.find(g => g.reward.parsed.type === 'gain_cash')! };
    s.goalRow.push(goal);
    giveGoalStock(s, 1, goal, 'decline');

    s.turnPhase = 'turn_complete';
    advance(s, []);
    const pr = s.pendingPrompts['p2']!;
    respondToPrompt(s, 'p2', pr.promptId, { claim: false });
    advance(s, []);

    expect(s.players[1].goalsClaimed.length).toBe(0);
    expect(s.gameOver).not.toBeNull();
  });
});

describe('Double Down', () => {
  function giveStock(state: GameState, playerId: string, color: Color): StockCard {
    const c = { ...catalog.stocks.find(x => x.color === color && x.type === 'blank')!, uid: `dd-stock-${color}-${Math.random()}` };
    state.players.find(p => p.playerId === playerId)!.hand.push(c);
    return c;
  }

  function giveDoubleDown(state: GameState, playerId: string): ActionCard {
    const dd = structuredClone(
      catalog.starterDeck.find(c => c.category === 'action' && c.effect.type === 'double_down')!
    ) as ActionCard;
    state.players.find(p => p.playerId === playerId)!.hand.push(dd);
    return dd;
  }

  it('doubling Pump and Dump lets the player sell two DIFFERENT stocks, not just one twice-ignored prompt', () => {
    const s = mkState();
    const dd = giveDoubleDown(s, 'p1');
    const pumpAndDump = giveActionCard(s, 'p1', 'sell_double');
    const blue = giveStock(s, 'p1', 'Blue');
    const orange = giveStock(s, 'p1', 'Orange');
    const cashBefore = s.players[0].cash;
    const blueBefore = s.stockPrices.Blue;
    const orangeBefore = s.stockPrices.Orange;

    play(s, 'p1', dd);
    const ddPrompt = s.pendingPrompts['p1']!;
    expect(ddPrompt.type).toBe('double_down_pick_card');
    respondToPrompt(s, 'p1', ddPrompt.promptId, { cardUid: pumpAndDump.uid });

    // First resolution: a pick_stock_from_hand prompt, not yet resolved twice.
    const first = s.pendingPrompts['p1']!;
    expect(first.type).toBe('pick_stock_from_hand');
    respondToPrompt(s, 'p1', first.promptId, { stockUid: blue.uid });
    expect(s.players[0].cash).toBe(cashBefore + blueBefore * 2);

    // The bug: this used to be null/some unrelated prompt because the second
    // resolveActionEffect call's setPrompt silently clobbered the first
    // before it was ever answered. It must now be a SECOND pick prompt.
    const second = s.pendingPrompts['p1']!;
    expect(second).not.toBeNull();
    expect(second.type).toBe('pick_stock_from_hand');
    respondToPrompt(s, 'p1', second.promptId, { stockUid: orange.uid });

    // Both stocks actually sold, at their own (different) prices.
    expect(s.players[0].cash).toBe(cashBefore + blueBefore * 2 + orangeBefore * 2);
    expect(s.players[0].hand.find(c => c.uid === blue.uid)).toBeUndefined();
    expect(s.players[0].hand.find(c => c.uid === orange.uid)).toBeUndefined();
    expect(s.discardPile.find(c => c.uid === blue.uid)).toBeTruthy();
    expect(s.discardPile.find(c => c.uid === orange.uid)).toBeTruthy();
    expect(s.pendingPrompts['p1']).toBeNull();
    expect(s.pendingDoubleDown).toHaveLength(0);
  });

  it('doubling an instant effect (Windfall) applies it twice immediately, no deferral needed', () => {
    const s = mkState();
    const dd = giveDoubleDown(s, 'p1');
    const windfall = structuredClone(
      catalog.starterDeck.find(c => c.category === 'action' && c.effect.type === 'windfall')!
    ) as ActionCard;
    s.players[0].hand.push(windfall);
    const cashBefore = s.players[0].cash;

    play(s, 'p1', dd);
    const ddPrompt = s.pendingPrompts['p1']!;
    respondToPrompt(s, 'p1', ddPrompt.promptId, { cardUid: windfall.uid });

    expect(s.players[0].cash).toBe(cashBefore + 10); // $5 twice
    expect(s.pendingPrompts['p1']).toBeNull();
    expect(s.pendingDoubleDown).toHaveLength(0);
  });

  it('doubling Liquidation lets the player run the full sell-batch loop twice', () => {
    const s = mkState();
    const dd = giveDoubleDown(s, 'p1');
    const liquidation = giveActionCard(s, 'p1', 'sell_same_bonus');
    const blue1 = giveStock(s, 'p1', 'Blue');
    const blue2 = giveStock(s, 'p1', 'Blue');
    const cashBefore = s.players[0].cash;

    play(s, 'p1', dd);
    const ddPrompt = s.pendingPrompts['p1']!;
    respondToPrompt(s, 'p1', ddPrompt.promptId, { cardUid: liquidation.uid });

    // First batch: sell blue1, then end the batch.
    let pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('pick_stock_from_hand');
    respondToPrompt(s, 'p1', pr.promptId, { stockUid: blue1.uid, done: true });

    // Second resolution should now start a NEW batch (not be silently lost).
    pr = s.pendingPrompts['p1']!;
    expect(pr).not.toBeNull();
    expect(pr.type).toBe('pick_stock_from_hand');
    respondToPrompt(s, 'p1', pr.promptId, { stockUid: blue2.uid, done: true });

    expect(s.players[0].cash).toBeGreaterThan(cashBefore);
    expect(s.players[0].hand.find(c => c.uid === blue1.uid)).toBeUndefined();
    expect(s.players[0].hand.find(c => c.uid === blue2.uid)).toBeUndefined();
    expect(s.pendingPrompts['p1']).toBeNull();
    expect(s.pendingDoubleDown).toHaveLength(0);
  });
});
