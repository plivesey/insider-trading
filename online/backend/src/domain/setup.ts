import type {
  CardCatalog,
  DeckCard,
  GameState,
  PlayerPrivate,
  PlayerId
} from '@insider-trading/shared';
import { shuffle } from './deck.js';
import { makeRng, type Rng } from './rng.js';

export interface SetupInput {
  catalog: CardCatalog;
  players: { playerId: PlayerId; name: string }[];
  seed: number;
  gameId: string;
  startedAt: string;
}

/** Mirror of /playtest/init.js but seeded + typed. */
export function createGameState(input: SetupInput): GameState {
  const { catalog, players, seed, gameId, startedAt } = input;
  if (players.length < 2 || players.length > 6) {
    throw new Error(`Player count must be 2..6, got ${players.length}`);
  }
  const rng: Rng = makeRng(seed);

  const numPlayers = players.length;
  const numTips = 2 * numPlayers - 1;
  const numGoals = numPlayers + 2;

  const mainDeck: DeckCard[] = shuffle<DeckCard>(
    [...catalog.stocks, ...catalog.actions],
    rng
  );
  const market = mainDeck.splice(0, 5);

  const insiderTipDeck = shuffle(catalog.insiderTips, rng).slice(0, numTips);
  const activeGoals = shuffle(catalog.goals, rng).slice(0, numGoals);

  // Random first player.
  const firstPlayerIndex = rng.int(numPlayers);

  const playerStates: PlayerPrivate[] = players.map(p => ({
    playerId: p.playerId,
    name: p.name,
    cash: 30,
    hand: [],
    hotTipAvailable: true,
    persistentEffects: [],
    loans: 0,
    endGameCashBonus: 0,
    goalsClaimed: [],
    forgeryAvailable: false
  }));

  const connected: Record<PlayerId, boolean> = {};
  const pendingPrompts: Record<PlayerId, null> = {};
  for (const p of players) {
    connected[p.playerId] = true;
    pendingPrompts[p.playerId] = null;
  }

  return {
    gameId,
    startedAt,
    seed,
    rngCursor: 0,
    version: 4,
    status: 'in_progress',
    stockPrices: { Blue: 4, Orange: 4, Yellow: 4, Purple: 4 },
    currentPlayerIndex: firstPlayerIndex,
    turnNumber: 1,
    turnPhase: 'awaiting_turn_action',
    auction: null,
    players: playerStates,
    market,
    mainDeck,
    discardPile: [],
    insiderTipDeck,
    resolvedInsiderTips: [],
    activeGoals,
    freeActionQueue: [],
    pendingPrompts,
    gameOver: null,
    log: [
      {
        seq: 1,
        ts: startedAt,
        turnNumber: 1,
        type: 'game_start',
        message: `Game ${gameId} started with ${numPlayers} players: ${players.map(p => p.name).join(', ')}. First player: ${playerStates[firstPlayerIndex].name}. Main deck ${mainDeck.length}, market ${market.length}, insider tips ${insiderTipDeck.length}, goals ${numGoals}.`,
        payload: {
          gameId,
          seed,
          players: players.map(p => ({ playerId: p.playerId, name: p.name })),
          firstPlayerIndex,
          numTips,
          numGoals
        }
      }
    ],
    eventCounter: 1,
    connected
  };
}
