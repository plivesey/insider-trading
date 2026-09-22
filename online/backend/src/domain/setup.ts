import type {
  ActionCard,
  CardCatalog,
  GameState,
  GameVariant,
  GoalCard,
  HandCard,
  InsiderTipCard,
  PlayerId,
  PlayerPrivate,
  RulesConfig,
  StockCard
} from '@insider-trading/shared';
import { ALL_DICE, VARIANT_DEFAULT_RULES, computeProgressThreshold } from '@insider-trading/shared';
import { shuffle } from './deck.js';
import { makeRng, type Rng } from './rng.js';

export interface SetupInput {
  catalog: CardCatalog;
  players: { playerId: PlayerId; name: string; isBot?: boolean }[];
  seed: number;
  gameId: string;
  startedAt: string;
  /** Which setup variant to build. Defaults to 'classic'. */
  variant?: GameVariant;
  /** Experimental rule overrides (still-being-playtested V5 numbers). Defaults = the chosen variant's shipped ruleset. */
  rules?: Partial<RulesConfig>;
}

/**
 * Build a fresh game (Classic or Alternate variant). Setup itself only builds
 * decks and deals the initial hands (rules.md Setup steps 1-5) -- the
 * pass-and-draft procedure (step 6) that reduces those to a final hand of 3
 * needs live per-player choices, so it's driven by `engine/setupDraft.ts` once
 * the game enters `turnPhase: 'setup_draft'`.
 */
export function createGameState(input: SetupInput): GameState {
  const { catalog, players, seed, gameId, startedAt } = input;
  if (players.length < 2 || players.length > 6) {
    throw new Error(`Player count must be 2..6, got ${players.length}`);
  }
  const rng: Rng = makeRng(seed);
  const variant: GameVariant = input.variant ?? 'classic';
  const rules: RulesConfig = { ...VARIANT_DEFAULT_RULES[variant], ...input.rules };
  const numPlayers = players.length;

  // 1. Market deck: 36 stock + N action cards. N = 11 (Classic) or 14
  //    (Alternate: the 11 shared cards + Backroom Deal/Double Down/Foresight
  //    promoted from the Starter Deck). Reveal 5.
  const actionPool: ActionCard[] = variant === 'alternate' ? [...catalog.actions, ...catalog.promotedActions] : catalog.actions;
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

  let initialHands: HandCard[][];

  if (variant === 'classic') {
    // 3. Starter deck: shuffle all 24 (12 basic stocks + 12 starter actions).
    const shuffledStarter = shuffle(catalog.starterDeck, rng);

    // 4. Deal 2 x players from the event deck + 2 x players from the starter
    //    deck (face-down), combine into ONE pile, and reshuffle it TOGETHER --
    //    deliberately not a guaranteed 2-and-2 split per player. Leftover
    //    undealt starter cards are permanently removed from the game.
    const eventDraw = eventDeck.splice(0, 2 * numPlayers);
    const starterDraw = shuffledStarter.slice(0, 2 * numPlayers);
    const combinedPile = shuffle<HandCard>([...eventDraw, ...starterDraw], rng);

    // 5. Deal that combined pile out completely: every player gets 4 cards.
    initialHands = players.map(() => []);
    for (let i = 0; i < combinedPile.length; i++) {
      initialHands[i % numPlayers].push(combinedPile[i]);
    }
  } else {
    // Alternate: no starter-action cards at all. Each player's draftable
    // 4-card hand comes straight off the (already-shuffled) event deck --
    // skip the combinedPile/starter-mixing step entirely.
    const eventDraw = eventDeck.splice(0, 4 * numPlayers);
    initialHands = players.map(() => []);
    for (let i = 0; i < eventDraw.length; i++) {
      initialHands[i % numPlayers].push(eventDraw[i]);
    }

    // Separately: shuffle the 8-card mini starter deck (2 basic stocks per
    // color) and deal exactly 1 per player, straight into their hand -- so
    // it's visible immediately, before the draft even starts. Its uid
    // (alt-starter-stock-N) is what tells setupDraft.ts's beginDraft() to
    // leave it in hand rather than sweep it into the draft pool. Leftovers
    // (8 - numPlayers) are permanently removed from the game, same precedent
    // as Classic's undealt starter cards.
    const shuffledAltStock = shuffle(catalog.alternateStarterStocks, rng);
    const dealtStock = shuffledAltStock.slice(0, numPlayers);
    dealtStock.forEach((stock, i) => {
      initialHands[i].push(stock);
    });
  }

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
  for (const p of players) {
    connected[p.playerId] = true;
    pendingPrompts[p.playerId] = null;
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
    gameOver: null,
    log: [
      {
        seq: 1,
        ts: startedAt,
        turnNumber: 1,
        type: 'game_start',
        message: `Game ${gameId} (${variant}) started with ${numPlayers} players: ${players.map(p => p.name).join(', ')}. First player: ${playerStates[firstPlayerIndex].name}. Market deck ${mainDeck.length}, market ${market.length}, event deck ${eventDeck.length}, goals revealed ${goalRow.length}, progress threshold ${progressThreshold}.`,
        payload: {
          gameId,
          seed,
          variant,
          players: players.map(p => ({ playerId: p.playerId, name: p.name })),
          firstPlayerIndex,
          numGoalsRevealed: goalRow.length,
          progressThreshold
        }
      }
    ],
    eventCounter: 1,
    connected,
    rules,
    variant
  };
}
