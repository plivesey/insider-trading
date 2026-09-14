import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadCards,
  type GameLogEntry,
  type GameState,
  type PlayerId
} from '@insider-trading/shared';
import { createGameState } from '../../src/domain/setup.js';
import { makeRng, type Rng } from '../../src/domain/rng.js';
import { advance } from '../../src/engine/advance.js';
import { bid, pass, startAuction } from '../../src/engine/auction.js';
import { submitFreeAction } from '../../src/engine/freeActions.js';
import { respondToPrompt } from '../../src/engine/promptResponse.js';
import { sellStock } from '../../src/engine/turn.js';
import { decideBotAction, type BotAction } from '../../src/bots/decide.js';
import { createBotProfile, type BotProfile } from '../../src/bots/profile.js';
import { assertGameOverInvariants } from './_invariants.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.resolve(HERE, '../../../../cards');
const catalog = loadCards(CARDS_DIR);

function botPlayers(n: number): { playerId: PlayerId; name: string; isBot: boolean }[] {
  return Array.from({ length: n }, (_, i) => ({
    playerId: `bot${i + 1}`,
    name: `Bot${i + 1}`,
    isBot: true
  }));
}

/** Run one bot action against `state` (no MutateQueue — engine functions directly). */
function executeBotActionDirect(
  state: GameState,
  playerId: PlayerId,
  action: BotAction,
  events: GameLogEntry[]
): boolean {
  let result: { ok: boolean; events: GameLogEntry[]; error?: string };
  switch (action.kind) {
    case 'turn_action': {
      const a = action.action;
      result =
        a.type === 'start_auction'
          ? startAuction(state, playerId, a.cardUid, a.initialBid)
          : sellStock(state, playerId, a.stockUid);
      break;
    }
    case 'auction_bid': {
      const a = action.action;
      result = a.type === 'bid' ? bid(state, playerId, a.amount) : pass(state, playerId);
      break;
    }
    case 'free_action':
      result = submitFreeAction(state, playerId, action.request);
      break;
    case 'prompt_response':
      result = respondToPrompt(state, playerId, action.promptId, action.response);
      break;
  }
  if (!result.ok) return false;
  events.push(...result.events);
  advance(state, events);
  return true;
}

/**
 * Drive a game to completion using bot decisions. Bails out with a clear
 * failure if no bot can act on a tick (i.e. someone is stuck).
 */
function driveBotGame(
  state: GameState,
  profiles: Map<PlayerId, BotProfile>,
  rng: Rng,
  maxTicks = 5000
): { ticks: number } {
  let ticks = 0;
  while (!state.gameOver) {
    ticks++;
    if (ticks > maxTicks) {
      throw new Error(
        `bot game exceeded ${maxTicks} ticks. phase=${state.turnPhase} ` +
          `currentPlayer=${state.players[state.currentPlayerIndex].name} ` +
          `tipsLeft=${state.insiderTipDeck.length} goalsLeft=${state.activeGoals.length} ` +
          `marketLen=${state.market.length} mainDeckLen=${state.mainDeck.length} ` +
          `turn=${state.turnNumber} ` +
          `prompts=${JSON.stringify(
            Object.fromEntries(
              Object.entries(state.pendingPrompts)
                .filter(([, p]) => !!p)
                .map(([k, p]) => [k, p?.type])
            )
          )}`
      );
    }
    let acted = false;
    for (const player of state.players) {
      const profile = profiles.get(player.playerId);
      if (!profile) continue;
      const action = decideBotAction(state, player.playerId, profile, { rng });
      if (!action) continue;
      const events: GameLogEntry[] = [];
      const ok = executeBotActionDirect(state, player.playerId, action, events);
      if (!ok) {
        throw new Error(
          `bot ${player.name} produced invalid action: ${JSON.stringify(action)}`
        );
      }
      acted = true;
      break; // re-scan from the top in case priorities shifted.
    }
    if (!acted) {
      throw new Error(
        `stuck: no bot has an action. phase=${state.turnPhase}, ` +
          `currentPlayer=${state.players[state.currentPlayerIndex].name}, ` +
          `pendingPrompts=${JSON.stringify(state.pendingPrompts)}`
      );
    }
  }
  return { ticks };
}

describe('bot full-game integration', () => {
  it.each([1, 42, 99, 1234, 7777])(
    'completes a 3-bot game with seed %i',
    seed => {
      const players = botPlayers(3);
      const state = createGameState({
        catalog,
        players,
        seed,
        gameId: `g-${seed}`,
        startedAt: '2026-01-01T00:00:00.000Z'
      });
      // Build per-bot profiles. Use a separate RNG (seeded from seed*2+1) so
      // bot personality is deterministic per test case.
      const botRng = makeRng((seed * 2 + 1) | 0);
      const profiles = new Map<PlayerId, BotProfile>();
      for (const p of players) profiles.set(p.playerId, createBotProfile(botRng));
      // RNG used for bot tick-time randomness (auction discounts, weighted picks).
      const tickRng = makeRng((seed * 4 + 7) | 0);
      const { ticks } = driveBotGame(state, profiles, tickRng);
      expect(state.gameOver).not.toBeNull();
      // Sanity: at least some progress happened.
      expect(ticks).toBeGreaterThan(0);
      assertGameOverInvariants(state);
    },
    30_000 // longer timeout for full-game simulation
  );
});
