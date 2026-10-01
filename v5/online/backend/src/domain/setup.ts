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
import { ALL_DICE, DEFAULT_RULES, computeProgressThreshold } from '@insider-trading/shared';
import { shuffle } from './deck.js';
import { makeRng, type Rng } from './rng.js';

export interface SetupInput {
  catalog: CardCatalog;
  players: { playerId: PlayerId; name: string; isBot?: boolean }[];
  seed: number;
  gameId: string;
  startedAt: string;
  /** Experimental rule overrides (still-being-playtested V5 numbers). Defaults = DEFAULT_RULES. */
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

  // 1. Market deck: 36 stock + 14 action cards (the 11 shared cards +
  //    Backroom Deal/Double Down/Foresight promoted from the Starter Deck).
  //    Reveal 5.
  const actionPool: ActionCard[] = [...catalog.actions, ...catalog.promotedActions];
  const mainDeck: (StockCard | ActionCard)[] = shuffle<StockCard | ActionCard>(
    [...catalog.stocks, ...actionPool],
    rng
  );
  const market = mainDeck.splice(0, 5);

  // 2. Event deck: shuffle all 30 (16 market-movement + 14 goal). Flip one at
  //    a time until `initialGoalRevealCount` goals have surfaced -> goalRow.
  //    Gather everything else (flipped market-movement cards + untouched
  //    remainder) and reshuffle -> the live event deck.
  const shuffledEvent = shuffle<InsiderTipCard | GoalCard>(
    [...catalog.insiderTips, ...catalog.goals],
    rng
  );
  const goalRow: GoalCard[] = [];
  const flippedNonGoals: InsiderTipCard[] = [];
  let cursor = 0;
  while (goalRow.length < rules.initialGoalRevealCount && cursor < shuffledEvent.length) {
    const card = shuffledEvent[cursor];
    cursor += 1;
    if (card.category === 'goal') {
      goalRow.push(card);
    } else {
      flippedNonGoals.push(card);
    }
  }
  const untouchedRemainder = shuffledEvent.slice(cursor);
  const eventDeck: (InsiderTipCard | GoalCard)[] = shuffle(
    [...flippedNonGoals, ...untouchedRemainder],
    rng
  );

  // 3. Each player's draftable 4-card hand comes straight off the
  //    (already-shuffled) event deck.
  const eventDraw = eventDeck.splice(0, 4 * numPlayers);
  const initialHands: HandCard[][] = players.map(() => []);
  for (let i = 0; i < eventDraw.length; i++) {
    initialHands[i % numPlayers].push(eventDraw[i]);
  }

  // 4. Separately: shuffle the 8-card mini starter deck (2 basic stocks per
  //    color) and deal exactly 1 per player, straight into their hand -- so
  //    it's visible immediately, before the draft even starts. Its uid
  //    (mini-starter-stock-N) is what tells setupDraft.ts's beginDraft() to
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
    version: 5,
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
    eventDeck,
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
        message: `Game ${gameId} started with ${numPlayers} players: ${players.map(p => p.name).join(', ')}. First player: ${playerStates[firstPlayerIndex].name}. Market deck ${mainDeck.length}, market ${market.length}, event deck ${eventDeck.length}, goals revealed ${goalRow.length}, progress threshold ${progressThreshold}.`,
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
