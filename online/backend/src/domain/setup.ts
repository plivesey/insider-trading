import type {
  ActionCard,
  CardCatalog,
  Color,
  GameState,
  GoalCard,
  HandCard,
  InsiderTipCard,
  PlayerId,
  PlayerPrivate,
  RulesConfig,
  StockCard
} from '@insider-trading/shared';
import {
  ALL_DICE,
  DEFAULT_RULES,
  computeGoalRevealCount,
  computeProgressThreshold
} from '@insider-trading/shared';
import { shuffle } from './deck.js';
import { makeRng, type Rng } from './rng.js';

/**
 * Splits `total` cards for the setup draft pool 50/50 between the tip deck
 * and goal reserve (mutating both via `splice`), clamping to whichever side
 * actually has enough and backfilling any shortfall from the tip deck --
 * see the 6-player goal-reserve-runs-short case in `createGameState`.
 */
function splitDraftPool(
  tipDeck: InsiderTipCard[],
  goalReserve: GoalCard[],
  total: number
): (InsiderTipCard | GoalCard)[] {
  const half = Math.ceil(total / 2);
  const fromTips = Math.min(half, tipDeck.length);
  const fromGoals = Math.min(total - fromTips, goalReserve.length);
  const shortfall = total - fromTips - fromGoals;
  const extraFromTips = Math.min(shortfall, tipDeck.length - fromTips);
  return [...tipDeck.splice(0, fromTips + extraFromTips), ...goalReserve.splice(0, fromGoals)];
}

export interface SetupInput {
  catalog: CardCatalog;
  players: { playerId: PlayerId; name: string; isBot?: boolean }[];
  seed: number;
  gameId: string;
  startedAt: string;
  /** Experimental rule overrides (still-being-playtested V6 numbers). Defaults = DEFAULT_RULES. */
  rules?: Partial<RulesConfig>;
}

/**
 * Build a fresh game. Setup itself only builds decks and deals the initial
 * hands (rules.md Setup steps 1-5) -- the pass-and-draft procedure (step 6)
 * that reduces those to a final hand of 3 needs live per-player choices, so
 * it's driven by `engine/setupDraft.ts` once the game enters
 * `turnPhase: 'setup_draft'`.
 */
export function createGameState(input: SetupInput): GameState {
  const { catalog, players, seed, gameId, startedAt } = input;
  if (players.length < 2 || players.length > 6) {
    throw new Error(`Player count must be 2..6, got ${players.length}`);
  }
  const rng: Rng = makeRng(seed);
  const rules: RulesConfig = { ...DEFAULT_RULES, ...input.rules };
  const numPlayers = players.length;

  // 1. Market deck: 36 stock + 14 action cards. Reveal 5.
  const actionPool: ActionCard[] = [...catalog.actions];
  const mainDeck: (StockCard | ActionCard)[] = shuffle<StockCard | ActionCard>(
    [...catalog.stocks, ...actionPool],
    rng
  );
  const market = mainDeck.splice(0, 5);

  // 2. Goals: shuffle all 19, reveal computeGoalRevealCount(numPlayers, rules)
  //    face-up -> goalRow. Everything left over -> the face-down goal
  //    reserve (setup-draft source only; never drawn in play).
  const shuffledGoals = shuffle<GoalCard>([...catalog.goals], rng);
  const goalRevealCount = computeGoalRevealCount(numPlayers, rules);
  const goalRow: GoalCard[] = shuffledGoals.slice(0, goalRevealCount);
  const goalReserve: GoalCard[] = shuffledGoals.slice(goalRevealCount);

  // 3. Tips: shuffle all 28 -> the live tip deck.
  const tipDeck: InsiderTipCard[] = shuffle<InsiderTipCard>([...catalog.insiderTips], rng);

  // 4. Each player's draftable 4-card hand splits 50/50 between the tip deck
  //    and the goal reserve, clamping/backfilling from whichever side has
  //    more left when the split can't be exact (e.g. a 6-player game's
  //    `players+3` reveal only leaves 10 goal-reserve cards for a 24-card
  //    pool that wants 12 -- backfill the shortfall from the tip deck rather
  //    than under-dealing).
  const draftPoolTotal = 4 * numPlayers;
  const draftPool = splitDraftPool(tipDeck, goalReserve, draftPoolTotal);
  const initialHands: HandCard[][] = players.map(() => []);
  for (let i = 0; i < draftPool.length; i++) {
    initialHands[i % numPlayers].push(draftPool[i]);
  }

  // 5. Separately: shuffle the 8-card starter stock deck (2 basic stocks per
  //    color) and deal exactly 1 per player, straight into their hand -- so
  //    it's visible immediately, before the draft even starts. Its uid
  //    (starter-stock-N) is what tells setupDraft.ts's beginDraft() to
  //    leave it in hand rather than sweep it into the draft pool. Leftovers
  //    (8 - numPlayers) are permanently removed from the game.
  const shuffledStarterStocks = shuffle(catalog.starterStocks, rng);
  const dealtStock = shuffledStarterStocks.slice(0, numPlayers);
  dealtStock.forEach((stock, i) => {
    initialHands[i].push(stock);
  });

  const firstPlayerIndex = rng.int(numPlayers);

  const playerStates: PlayerPrivate[] = players.map((p, seat) => ({
    playerId: p.playerId,
    name: p.name,
    cash: 25,
    hand: initialHands[seat],
    persistentEffects: [],
    loans: 0,
    endGameCashBonus: 0,
    goalsClaimed: [],
    isBot: p.isBot
  }));

  const connected: Record<PlayerId, boolean> = {};
  const pendingPrompts: Record<PlayerId, null> = {};
  // Public knowledge starts at 0 for everyone -- the guaranteed starter stock
  // is deliberately NOT recorded here (see GameState.publicStockKnowledge):
  // it's dealt secretly, unlike every later stock transfer.
  const publicStockKnowledge: Record<PlayerId, Record<Color, number>> = {};
  for (const p of players) {
    connected[p.playerId] = true;
    pendingPrompts[p.playerId] = null;
    publicStockKnowledge[p.playerId] = { Blue: 0, Orange: 0, Green: 0, Purple: 0 };
  }

  const progressThreshold = computeProgressThreshold(numPlayers, rules);

  return {
    gameId,
    startedAt,
    seed,
    rngCursor: 0,
    version: 6,
    status: 'in_progress',
    stockPrices: { Blue: 4, Orange: 4, Green: 4, Purple: 4 },
    currentPlayerIndex: firstPlayerIndex,
    turnNumber: 1,
    turnPhase: 'setup_draft',
    auction: null,
    players: playerStates,
    market,
    mainDeck,
    discardPile: [],
    tipDeck,
    goalReserve,
    resolvedEventCards: [],
    goalRow,
    progressTracker: 0,
    progressThreshold,
    diceBagRemaining: [...ALL_DICE],
    draft: null,
    freeActionQueue: [],
    pendingPrompts,
    pendingDoubleDown: [],
    publicStockKnowledge,
    gameOver: null,
    log: [
      {
        seq: 1,
        ts: startedAt,
        turnNumber: 1,
        type: 'game_start',
        message: `Game ${gameId} started with ${numPlayers} players: ${players.map(p => p.name).join(', ')}. First player: ${playerStates[firstPlayerIndex].name}. Market deck ${mainDeck.length}, market ${market.length}, tip deck ${tipDeck.length}, goal reserve ${goalReserve.length}, goals revealed ${goalRow.length}, progress threshold ${progressThreshold}.`,
        payload: {
          gameId,
          seed,
          players: players.map(p => ({ playerId: p.playerId, name: p.name })),
          firstPlayerIndex,
          numGoalsRevealed: goalRow.length,
          progressThreshold
        }
      }
    ],
    eventCounter: 1,
    connected,
    rules
  };
}
