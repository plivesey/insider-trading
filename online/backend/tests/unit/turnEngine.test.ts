import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCards, type GameState } from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { sellStock, payBank, currentPlayer } from '../../src/engine/turn.js';
import { startAuction, bid, pass } from '../../src/engine/auction.js';
import { advance } from '../../src/engine/advance.js';
import { respondToPrompt } from '../../src/engine/promptResponse.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');
const catalog = loadCards(CARDS_DIR);

function mkState(seed = 1): GameState {
  return createGameState({
    catalog,
    players: [
      { playerId: 'p1', name: 'A' },
      { playerId: 'p2', name: 'B' },
      { playerId: 'p3', name: 'C' }
    ],
    seed,
    gameId: 'g',
    startedAt: '2026-01-01T00:00:00.000Z'
  });
}

describe('autoLoan via payBank', () => {
  it('issues correct number of loans when cash insufficient', () => {
    const state = mkState();
    const p = state.players[0];
    p.cash = 5;
    payBank(p, 18, []);
    // owed = 13; loans needed = ceil(13/10) = 2; cash becomes 5 + 20 - 18 = 7
    expect(p.loans).toBe(2);
    expect(p.cash).toBe(7);
  });
  it('no loan when cash sufficient', () => {
    const state = mkState();
    const p = state.players[0];
    p.cash = 20;
    payBank(p, 5, []);
    expect(p.loans).toBe(0);
    expect(p.cash).toBe(15);
  });
});

describe('startAuction', () => {
  it('rejects if not your turn', () => {
    const state = mkState();
    const other = state.players[(state.currentPlayerIndex + 1) % 3];
    const card = state.market[0];
    const r = startAuction(state, other.playerId, card.uid, 1);
    expect(r.ok).toBe(false);
  });
  it('creates an auction and prompts the next bidder', () => {
    const state = mkState();
    const me = currentPlayer(state);
    const card = state.market[0];
    const r = startAuction(state, me.playerId, card.uid, 2);
    expect(r.ok).toBe(true);
    expect(state.turnPhase).toBe('in_auction');
    expect(state.auction).not.toBeNull();
    expect(state.auction!.currentHigh).toBe(2);
    expect(state.auction!.currentHighBidderId).toBe(me.playerId);
    // The next-in-order player should have a prompt.
    const nextId = state.auction!.awaitingBidderId!;
    expect(state.pendingPrompts[nextId]).not.toBeNull();
  });

  it('resolves to auctioneer if no one else bids', () => {
    const state = mkState();
    const me = currentPlayer(state);
    const card = state.market.find(c => c.category === 'stock') ?? state.market[0];
    startAuction(state, me.playerId, card.uid, 3);
    // Every other player passes.
    while (state.auction) {
      const awaiting = state.auction.awaitingBidderId!;
      const r = pass(state, awaiting);
      expect(r.ok).toBe(true);
    }
    // Auction resolved; me holds the card.
    expect(me.hand.find(c => c.uid === card.uid)).toBeTruthy();
    expect(me.cash).toBe(30 - 3);
  });
});

describe('full turn drive — start auction, others pass, die roll, advance', () => {
  it('completes a turn including end-of-turn die roll and player advance', async () => {
    const state = mkState(123);
    const events: any[] = [];
    const before = state.players[state.currentPlayerIndex].playerId;
    const card = state.market.find(c => c.category === 'stock' && c.color !== 'Wild') ?? state.market[0];
    const r1 = startAuction(state, before, card.uid, 1);
    events.push(...r1.events);
    while (state.auction) {
      const awaiting = state.auction.awaitingBidderId!;
      const r = pass(state, awaiting);
      events.push(...r.events);
    }
    // Sub-prompts may exist (e.g. Tip-Off, Scout). Acknowledge all.
    while (Object.values(state.pendingPrompts).some(p => p)) {
      const [id, p] = Object.entries(state.pendingPrompts).find(([_, v]) => v) as [string, any];
      if (p.type === 'pick_color') {
        const exclude = p.payload.exclude;
        const color = ['Blue', 'Orange', 'Yellow', 'Purple'].find(c => c !== exclude)!;
        const r = respondToPrompt(state, id, p.promptId, { color });
        events.push(...r.events);
      } else if (p.type === 'peek_ack') {
        const r = respondToPrompt(state, id, p.promptId, {});
        events.push(...r.events);
      } else {
        throw new Error(`unexpected prompt type ${p.type}`);
      }
    }
    advance(state, events);
    expect(state.gameOver).toBeNull();
    expect(state.turnPhase).toBe('awaiting_turn_action');
    expect(state.turnNumber).toBe(2);
    // Currently-active player has changed.
    expect(state.players[state.currentPlayerIndex].playerId).not.toBe(before);
  });
});

describe('sellStock', () => {
  it('refuses to sell from non-current player', () => {
    const state = mkState();
    const other = state.players[(state.currentPlayerIndex + 1) % 3];
    other.hand.push(catalog.stocks.find(s => s.color === 'Blue' && s.type === 'blank')!);
    const stock = other.hand[0];
    const r = sellStock(state, other.playerId, stock.uid);
    expect(r.ok).toBe(false);
  });
  it('sells a blue stock at current price, lowers price -1', () => {
    const state = mkState();
    const me = currentPlayer(state);
    me.hand.push(catalog.stocks.find(s => s.color === 'Orange' && s.type === 'blank')!);
    const r = sellStock(state, me.playerId, me.hand[0].uid);
    expect(r.ok).toBe(true);
    expect(me.cash).toBe(30 + 4);
    expect(state.stockPrices.Orange).toBe(3);
    expect(state.turnPhase).toBe('awaiting_die_roll');
  });
  it('refuses to sell a Wild Share', () => {
    const state = mkState();
    const me = currentPlayer(state);
    me.hand.push(catalog.stocks.find(s => s.color === 'Wild')!);
    const r = sellStock(state, me.playerId, me.hand[0].uid);
    expect(r.ok).toBe(false);
  });
  it('Informant sets a peek prompt on sale', () => {
    const state = mkState();
    const me = currentPlayer(state);
    const informant = catalog.stocks.find(s => s.color === 'Purple' && s.type === 'peek_sell')!;
    me.hand.push(informant);
    const r = sellStock(state, me.playerId, informant.uid);
    expect(r.ok).toBe(true);
    expect(state.pendingPrompts[me.playerId]).not.toBeNull();
    expect(state.pendingPrompts[me.playerId]?.type).toBe('peek_ack');
  });
});

describe('auctioneer can re-bid after being outbid', () => {
  it('prompts the auctioneer again once another player has raised and the rest have passed', () => {
    const state = mkState();
    const alice = currentPlayer(state); // auctioneer
    const bob = state.players[(state.currentPlayerIndex + 1) % 3];
    const cam = state.players[(state.currentPlayerIndex + 2) % 3];
    const card = state.market[0];

    // Alice starts at $5.
    startAuction(state, alice.playerId, card.uid, 5);
    expect(state.auction!.awaitingBidderId).toBe(bob.playerId);

    // Bob bids $6.
    const r1 = bid(state, bob.playerId, 6);
    expect(r1.ok).toBe(true);
    expect(state.auction!.currentHighBidderId).toBe(bob.playerId);
    expect(state.auction!.awaitingBidderId).toBe(cam.playerId);

    // Cam passes.
    const r2 = pass(state, cam.playerId);
    expect(r2.ok).toBe(true);

    // Auction must NOT have resolved — Alice is still in the rotation.
    expect(state.auction).not.toBeNull();
    expect(state.auction!.awaitingBidderId).toBe(alice.playerId);

    // Alice re-bids $7, beating Bob.
    const r3 = bid(state, alice.playerId, 7);
    expect(r3.ok).toBe(true);
    expect(state.auction!.currentHighBidderId).toBe(alice.playerId);
    expect(state.auction!.awaitingBidderId).toBe(bob.playerId);

    // Bob passes; auction resolves to Alice (Cam already out).
    const r4 = pass(state, bob.playerId);
    expect(r4.ok).toBe(true);
    expect(state.auction).toBeNull();
    expect(alice.hand.find(c => c.uid === card.uid)).toBeTruthy();
  });
});

describe('preferred bidder tie-break', () => {
  it('allows holder to tie the high bid', () => {
    const state = mkState();
    const me = currentPlayer(state);
    const next = state.players[(state.currentPlayerIndex + 1) % 3];
    // Give next player Preferred Bidder.
    const pref = catalog.actions.find(a => a.effect.type === 'tie_breaker')!;
    next.persistentEffects.push(pref);
    const card = state.market[0];
    startAuction(state, me.playerId, card.uid, 5);
    const r = bid(state, next.playerId, 5);
    expect(r.ok).toBe(true);
    expect(state.auction!.currentHighBidderId).toBe(next.playerId);
  });
  it('refuses ties without preferred bidder', () => {
    const state = mkState();
    const me = currentPlayer(state);
    const next = state.players[(state.currentPlayerIndex + 1) % 3];
    const card = state.market[0];
    startAuction(state, me.playerId, card.uid, 5);
    const r = bid(state, next.playerId, 5);
    expect(r.ok).toBe(false);
  });
});
