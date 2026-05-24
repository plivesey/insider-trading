import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v4 as uuidv4 } from 'uuid';
import { loadCards, type CardCatalog, type GameState, type LobbyMember, type PlayerId } from '@insider-trading/shared';
import { MutateQueue } from '../domain/mutate.js';
import { createGameState } from '../domain/setup.js';
import { openLog, closeLog, appendLog } from '../domain/gameLog.js';

export interface LobbyEntry {
  playerId: PlayerId;
  name: string;
  connected: boolean;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CARDS_DIR = path.resolve(HERE, '../../../../cards');

export class ServerHub {
  catalog: CardCatalog;
  lobby: LobbyEntry[] = [];
  queue: MutateQueue;
  snapshotPath: string;
  logsDir: string;
  cardsDir: string;
  defaultSeed: number | undefined;

  constructor(opts: {
    cardsDir?: string;
    snapshotPath: string;
    logsDir: string;
    defaultSeed?: number;
  } = {} as any) {
    this.cardsDir = opts.cardsDir ?? DEFAULT_CARDS_DIR;
    this.snapshotPath = opts.snapshotPath;
    this.logsDir = opts.logsDir;
    this.defaultSeed = opts.defaultSeed;
    this.catalog = loadCards(this.cardsDir);
    this.queue = new MutateQueue();
    this.queue.setSnapshotPath(this.snapshotPath);
  }

  getMode(): 'lobby' | 'in_game' | 'game_over' {
    const game = this.queue.getState();
    if (!game) return 'lobby';
    if (game.gameOver) return 'game_over';
    return 'in_game';
  }

  getGame(): GameState | null {
    return this.queue.getState();
  }

  findPlayerByCookie(playerId: string): LobbyEntry | null {
    const inLobby = this.lobby.find(p => p.playerId === playerId);
    if (inLobby) return inLobby;
    const game = this.getGame();
    if (game) {
      const player = game.players.find(p => p.playerId === playerId);
      if (player) {
        return { playerId: player.playerId, name: player.name, connected: !!game.connected[playerId] };
      }
    }
    return null;
  }

  join(name: string, existingPlayerId?: string): LobbyEntry | { error: string } {
    if (this.getGame() && !this.getGame()!.gameOver) {
      // Game in progress: only allow rejoin (cookie matches an existing player).
      if (existingPlayerId) {
        const game = this.getGame()!;
        const existing = game.players.find(p => p.playerId === existingPlayerId);
        if (existing) {
          game.connected[existingPlayerId] = true;
          return { playerId: existing.playerId, name: existing.name, connected: true };
        }
      }
      return { error: 'game in progress — wait for next game' };
    }
    // Reuse existing lobby seat if cookie matches.
    if (existingPlayerId) {
      const existing = this.lobby.find(p => p.playerId === existingPlayerId);
      if (existing) {
        if (name && existing.name !== name) existing.name = name;
        existing.connected = true;
        return existing;
      }
    }
    if (!name || !name.trim()) return { error: 'name required' };
    if (this.lobby.length >= 6) return { error: 'lobby full (max 6)' };
    if (this.lobby.some(p => p.name === name)) return { error: `name "${name}" taken` };
    const entry: LobbyEntry = {
      playerId: existingPlayerId ?? uuidv4(),
      name: name.trim(),
      connected: true
    };
    this.lobby.push(entry);
    return entry;
  }

  startGame(seed?: number): Promise<{ ok: boolean; error?: string }> {
    if (this.getGame() && !this.getGame()!.gameOver) {
      return Promise.resolve({ ok: false, error: 'game already in progress' });
    }
    if (this.lobby.length < 2) return Promise.resolve({ ok: false, error: 'need at least 2 players' });
    const gameId = uuidv4();
    const startedAt = new Date().toISOString();
    const realSeed = seed ?? this.defaultSeed ?? Date.now();
    const state = createGameState({
      catalog: this.catalog,
      players: this.lobby.map(p => ({ playerId: p.playerId, name: p.name })),
      seed: realSeed,
      gameId,
      startedAt
    });
    openLog(this.logsDir, gameId, startedAt);
    // Persist the initial game_start log entry so replay starts from a
    // complete record. The MutateQueue only appends events from mutations,
    // not setup.
    for (const ev of state.log) appendLog(ev);
    this.queue.setState(state);
    return Promise.resolve({ ok: true });
  }

  reset(): void {
    closeLog();
    this.queue.setState(null);
    this.lobby = [];
  }

  lobbyMembers(): LobbyMember[] {
    return this.lobby.map(l => ({ playerId: l.playerId, name: l.name, connected: l.connected }));
  }
}
