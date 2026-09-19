import type {
  GameState,
  HandCard,
  PlayerId,
  PlayerPublic,
  ProjectedGameState
} from '@insider-trading/shared';

export function projectState(game: GameState, viewerId: PlayerId | null): ProjectedGameState {
  const players: PlayerPublic[] = game.players.map(p => ({
    playerId: p.playerId,
    name: p.name,
    cash: p.cash,
    handSize: p.hand.length,
    persistentEffects: p.persistentEffects,
    loans: p.loans,
    goalsClaimed: p.goalsClaimed,
    connected: !!game.connected[p.playerId],
    isBot: p.isBot
  }));
  const my = viewerId ? game.players.find(p => p.playerId === viewerId) ?? null : null;
  const myPrompt = viewerId ? game.pendingPrompts[viewerId] ?? null : null;
  let revealedHands: Record<PlayerId, HandCard[]> | undefined;
  if (game.status === 'finished') {
    revealedHands = {};
    for (const p of game.players) revealedHands[p.playerId] = p.hand;
  }
  return {
    gameId: game.gameId,
    startedAt: game.startedAt,
    version: game.version,
    variant: game.variant,
    status: game.status,
    stockPrices: game.stockPrices,
    currentPlayerIndex: game.currentPlayerIndex,
    turnNumber: game.turnNumber,
    players,
    myPlayer: my,
    market: game.market,
    mainDeckSize: game.mainDeck.length,
    discardPileSize: game.discardPile.length,
    eventDeckSize: game.eventDeck.length,
    resolvedEventCards: game.resolvedEventCards,
    goalRow: game.goalRow,
    progressTracker: game.progressTracker,
    progressThreshold: game.progressThreshold,
    auction: game.auction,
    myPrompt,
    gameOver: game.gameOver,
    revealedHands
  };
}
