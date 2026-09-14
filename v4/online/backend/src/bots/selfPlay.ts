import type {
  CardCatalog,
  GameLogEntry,
  GameOverBreakdownEntry,
  GameState,
  PlayerId,
  RulesConfig
} from '@insider-trading/shared';
import { createGameState } from '../domain/setup.js';
import { makeRng, type Rng } from '../domain/rng.js';
import { advance } from '../engine/advance.js';
import { bid, pass, startAuction } from '../engine/auction.js';
import { submitFreeAction } from '../engine/freeActions.js';
import { respondToPrompt } from '../engine/promptResponse.js';
import { sellStock } from '../engine/turn.js';
import { decideBotAction, type BotAction } from './decide.js';
import type { BotProfile } from './profile.js';

/**
 * Headless, hub-free game runner. Drives a full game where every seat is a bot
 * using `decideBotAction`, by calling engine functions directly — no ServerHub,
 * no MutateQueue, no log files (so `appendLog` stays a no-op and the run is
 * deterministic from its seeds). Used by the ES trainer and the A/B harness.
 */

export interface SelfPlayResult {
  ticks: number;
  finished: boolean; // reached a game-over state
  stuck: boolean; // a tick produced no action (livelock / invalid action / engine cap)
  turnNumber: number; // total player-turns when the game ended (game-length metric)
  endReason: 'insider_tip_deck_empty' | 'one_goal_remaining' | null;
  breakdown: GameOverBreakdownEntry[];
  winnerPlayerIds: PlayerId[];
}

export interface SelfPlaySeat {
  playerId: PlayerId;
  name: string;
  profile: BotProfile;
}

/**
 * Apply one bot action to `state`, mirroring the HTTP route wrapping: on success
 * push events and call `advance` exactly once (do NOT advance again upstream).
 * Returns false if the action was rejected by the engine.
 */
export function executeBotActionDirect(
  state: GameState,
  playerId: PlayerId,
  action: BotAction,
  events: GameLogEntry[]
): boolean {
  let result;
  switch (action.kind) {
    case 'turn_action':
      result =
        action.action.type === 'start_auction'
          ? startAuction(state, playerId, action.action.cardUid, action.action.initialBid)
          : sellStock(state, playerId, action.action.stockUid);
      break;
    case 'auction_bid':
      result =
        action.action.type === 'bid'
          ? bid(state, playerId, action.action.amount)
          : pass(state, playerId);
      break;
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
 * Drive `state` to game-over. Each tick: the first bot with a non-null
 * `decideBotAction` acts. Terminates on game-over, the tick cap, or a stuck tick
 * (no bot acted, an invalid action, or the engine's internal advance cap throwing).
 */
export function driveSelfPlay(
  state: GameState,
  profiles: Map<PlayerId, BotProfile>,
  rng: Rng,
  maxTicks = 20000
): SelfPlayResult {
  let ticks = 0;
  let stuck = false;
  try {
    while (!state.gameOver && ticks < maxTicks) {
      ticks++;
      let acted = false;
      for (const player of state.players) {
        const profile = profiles.get(player.playerId);
        if (!profile) continue;
        const action = decideBotAction(state, player.playerId, profile, { rng });
        if (!action) continue;
        const events: GameLogEntry[] = [];
        const ok = executeBotActionDirect(state, player.playerId, action, events);
        if (!ok) {
          stuck = true;
          break;
        }
        acted = true;
        break;
      }
      if (stuck) break;
      if (!acted) {
        stuck = true;
        break;
      }
    }
  } catch {
    // advance() throws if its internal safety cap is hit (pathological game).
    stuck = true;
  }
  if (ticks >= maxTicks && !state.gameOver) stuck = true;
  return {
    ticks,
    finished: !!state.gameOver,
    stuck,
    turnNumber: state.turnNumber,
    endReason: state.gameOver?.reason ?? null,
    breakdown: state.gameOver?.breakdown ?? [],
    winnerPlayerIds: state.gameOver?.winnerPlayerIds ?? []
  };
}

/** Set up and play one complete game. `gameSeed` seeds the engine; `tickSeed` seeds bot decisions. */
export function playOneGame(opts: {
  catalog: CardCatalog;
  seats: SelfPlaySeat[];
  gameSeed: number;
  tickSeed: number;
  gameId?: string;
  startedAt?: string;
  maxTicks?: number;
  rules?: Partial<RulesConfig>;
}): SelfPlayResult {
  const state = createGameState({
    catalog: opts.catalog,
    players: opts.seats.map(s => ({ playerId: s.playerId, name: s.name, isBot: true })),
    seed: opts.gameSeed,
    gameId: opts.gameId ?? `sp-${opts.gameSeed}`,
    startedAt: opts.startedAt ?? '2026-01-01T00:00:00.000Z',
    rules: opts.rules
  });
  const profiles = new Map<PlayerId, BotProfile>();
  for (const s of opts.seats) profiles.set(s.playerId, s.profile);
  const rng = makeRng(opts.tickSeed);
  return driveSelfPlay(state, profiles, rng, opts.maxTicks);
}
