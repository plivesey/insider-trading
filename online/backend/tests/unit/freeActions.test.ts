import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards, CLASSIC_RULES, type GameState, type ActionCard, type GoalCard, type Color, type StockCard, type HandCard } from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { submitFreeAction, processNextFreeAction } from '../../src/engine/freeActions.js';
import { respondToPrompt } from '../../src/engine/promptResponse.js';
import { advance } from '../../src/engine/advance.js';
import { pass } from '../../src/engine/auction.js';
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
    startedAt: '2026-01-01T00:00:00.000Z',
    rules: CLASSIC_RULES // engine-mechanics tests use the classic setup (empty hand, end at 1 goal)
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
      choices: { Blue: 1, Orange: -1, Yellow: 1, Purple: -1 }
    });
    expect(s.stockPrices).toEqual({ Blue: 5, Orange: 3, Yellow: 5, Purple: 3 });
  });

  it('Insider Source: draws top tip into hand, deck shrinks by 1', () => {
    const s = mkState();
    const topBefore = s.insiderTipDeck[0];
    const sizeBefore = s.insiderTipDeck.length;
    expect(sizeBefore).toBeGreaterThan(1); // ensure non-final-draw path
    const ac = giveActionCard(s, 'p1', 'draw_tip');
    play(s, 'p1', ac);
    expect(s.insiderTipDeck.length).toBe(sizeBefore - 1);
    expect(s.insiderTipDeck.find(t => t.uid === topBefore.uid)).toBeUndefined();
    expect(s.players[0].hand.find(c => c.uid === topBefore.uid)).toBeTruthy();
    expect(s.pendingPrompts['p1']).toBeNull(); // no final-tip prompt
  });

  it('Insider Source: playing tip from hand resolves its effect', () => {
    const s = mkState();
    const ac = giveActionCard(s, 'p1', 'draw_tip');
    play(s, 'p1', ac);
    const tip = s.players[0].hand.find(c => c.category === 'insider_tip')!;
    const beforePrices = { ...s.stockPrices };
    submitFreeAction(s, 'p1', { kind: 'play_insider_tip', cardUid: tip.uid });
    processNextFreeAction(s, []);
    expect(s.players[0].hand.find(c => c.uid === tip.uid)).toBeUndefined();
    expect(s.resolvedInsiderTips.find(t => t.uid === tip.uid)).toBeTruthy();
    // Prices changed (any of crash/surge/slump moves something).
    expect(s.stockPrices).not.toEqual(beforePrices);
  });

  it('Insider Source: drawing the LAST tip triggers final-play prompt', () => {
    const s = mkState();
    // Drain the tip deck down to exactly 1.
    s.insiderTipDeck = s.insiderTipDeck.slice(0, 1);
    const lastTip = s.insiderTipDeck[0];
    const ac = giveActionCard(s, 'p1', 'draw_tip');
    play(s, 'p1', ac);
    expect(s.insiderTipDeck.length).toBe(0);
    expect(s.players[0].hand.find(c => c.uid === lastTip.uid)).toBeTruthy();
    const pr = s.pendingPrompts['p1']!;
    expect(pr.type).toBe('final_tip_play_choice');
    expect((pr.payload as any).tipUid).toBe(lastTip.uid);
    // Decline: tip stays in hand, prompt clears, game ends after advance.
    respondToPrompt(s, 'p1', pr.promptId, { play: false });
    expect(s.players[0].hand.find(c => c.uid === lastTip.uid)).toBeTruthy();
    advance(s, []);
    expect(s.gameOver).not.toBeNull();
    expect(s.gameOver!.reason).toBe('insider_tip_deck_empty');
  });

  it('Insider Source: choosing PLAY on final-tip prompt resolves the tip then ends game', () => {
    const s = mkState();
    s.insiderTipDeck = s.insiderTipDeck.slice(0, 1);
    const lastTip = s.insiderTipDeck[0];
    const ac = giveActionCard(s, 'p1', 'draw_tip');
    play(s, 'p1', ac);
    const pr = s.pendingPrompts['p1']!;
    respondToPrompt(s, 'p1', pr.promptId, { play: true });
    expect(s.players[0].hand.find(c => c.uid === lastTip.uid)).toBeUndefined();
    expect(s.resolvedInsiderTips.find(t => t.uid === lastTip.uid)).toBeTruthy();
    advance(s, []);
    expect(s.gameOver).not.toBeNull();
  });
});

describe('Black Market trigger', () => {
  function mkStateWithBlackMarketInMarket(seed = 7): GameState {
    const s = mkState(seed);
    // Remove any Black Markets that landed in market/mainDeck so we control
    // exactly how many triggers fire during the test.
    s.market = s.market.filter(
      c => !(c.category === 'action' && (c as any).effect.type === 'auction_unused_tip')
    );
    s.mainDeck = s.mainDeck.filter(
      c => !(c.category === 'action' && (c as any).effect.type === 'auction_unused_tip')
    );
    // Inject exactly one Black Market into market slot 0.
    const bm = structuredClone(catalog.actions.find(a => a.effect.type === 'auction_unused_tip')!);
    s.market.unshift(bm);
    // Trim market back to 5 if injection overflowed; otherwise leave (refill
    // will top it up after the trigger removes the BM).
    if (s.market.length > 5) s.market.length = 5;
    return s;
  }

  it('starts a side-auction for a face-down unused tip when Black Market is in market', () => {
    const s = mkStateWithBlackMarketInMarket();
    const beforePool = s.unusedInsiderTipPool.length;
    expect(beforePool).toBeGreaterThan(0);
    advance(s, []);
    // Side-auction should be in flight, market should still have 5 cards
    // (Black Market removed; one new card refilled in), pool shrank by 1.
    expect(s.auction).not.toBeNull();
    expect(s.auction!.sideAuctionTip).toBeDefined();
    expect(s.market).toHaveLength(5);
    expect(s.market.some(c => c.category === 'action' && (c as any).effect.type === 'auction_unused_tip')).toBe(false);
    expect(s.unusedInsiderTipPool.length).toBe(beforePool - 1);
    expect(s.turnPhase).toBe('in_auction');
  });

  it('side-auction: everyone passes → auctioneer wins the tip for $0', () => {
    const s = mkStateWithBlackMarketInMarket();
    const auctioneer = s.players[s.currentPlayerIndex];
    const beforeCash = auctioneer.cash;
    advance(s, []);
    const tip = s.auction!.sideAuctionTip!;
    // Everyone else passes; auctioneer also passes (since no one beat $0).
    let safety = 20;
    while (s.auction && safety-- > 0) {
      const r = pass(s, s.auction.awaitingBidderId!);
      expect(r.ok).toBe(true);
    }
    expect(s.auction).toBeNull();
    expect(auctioneer.hand.find(c => c.uid === tip.uid)).toBeTruthy();
    expect(auctioneer.cash).toBe(beforeCash); // $0 final price
  });

  it('Black Market fizzles when unused pool is empty', () => {
    const s = mkStateWithBlackMarketInMarket();
    s.unusedInsiderTipPool = []; // empty the pool
    const beforeMarketLen = s.market.length;
    advance(s, []);
    expect(s.auction).toBeNull();
    expect(s.market.some(c => c.category === 'action' && (c as any).effect.type === 'auction_unused_tip')).toBe(false);
    // Refill should keep market at full 5.
    expect(s.market).toHaveLength(beforeMarketLen);
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

describe('Hot Tip', () => {
  it('peek + ack removes the Hot Tip card from hand', () => {
    const s = mkState();
    const hotTip = s.players[0].hand.find(
      c => c.category === 'action' && (c as any).effect.type === 'peek_top_tip'
    )!;
    expect(hotTip).toBeTruthy();
    submitFreeAction(s, 'p1', { kind: 'play_action_card', cardUid: hotTip.uid });
    processNextFreeAction(s, []);
    expect(s.players[0].hand.find(c => c.uid === hotTip.uid)).toBeUndefined();
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

  it('end-game cash reward (2 Yellow + 2 Purple → +$11 at end)', () => {
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
    expect(s.players[0].endGameCashBonus).toBe(11);
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
    expect(s.players[0].cash).toBe(30 + 2 + 1); // $2 from Bob, $1 from Carol
    expect(s.players[1].cash).toBe(8);
    expect(s.players[2].cash).toBe(0);
  });
});

describe('end conditions via goal claim', () => {
  it('triggers game_over when activeGoals reduced to 1 (no-prompt reward)', () => {
    const s = mkState();
    // Pick a goal whose reward does NOT set a prompt (gain_cash) so end
    // conditions fire as soon as advance() drains the queue.
    const noPromptGoal: GoalCard = {
      ...catalog.goals.find(g => g.reward.parsed.type === 'gain_cash')!
    };
    s.activeGoals = [noPromptGoal, { ...catalog.goals.find(g => g.id !== noPromptGoal.id)! }];
    const goal = s.activeGoals[0];
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
    advance(s, []);
    expect(s.gameOver).not.toBeNull();
    expect(s.gameOver!.reason).toBe('one_goal_remaining');
  });

  it('defers game_over until reward prompt is resolved', () => {
    const s = mkState();
    // Pick a goal whose reward sets a prompt (adjust_stock = ±N). The game
    // must NOT end until the reward prompt is satisfied.
    const goal: GoalCard = {
      ...catalog.goals.find(g => g.reward.parsed.type === 'adjust_stock')!
    };
    s.activeGoals = [goal, { ...catalog.goals.find(g => g.id !== goal.id)! }];
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
    // The reward prompt should be open, and the game must still be running.
    const pr = s.pendingPrompts['p1']!;
    expect(pr).not.toBeNull();
    expect(pr.type).toBe('pick_color_amount');
    expect(s.gameOver).toBeNull();
    // Resolve the prompt — only now should the game end.
    respondToPrompt(s, 'p1', pr.promptId, { color: 'Blue', sign: 'up' });
    advance(s, []);
    expect(s.gameOver).not.toBeNull();
    expect(s.gameOver!.reason).toBe('one_goal_remaining');
  });
});
