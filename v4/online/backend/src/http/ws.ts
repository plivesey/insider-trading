import type { IncomingMessage, Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { parse as parseCookie } from 'cookie';
import {
  PLAYER_COOKIE,
  type GameLogEntry,
  type GameState,
  type ServerWsMessage,
  type StateResponse
} from '@insider-trading/shared';
import type { ServerHub } from '../state/serverState.js';
import { projectState } from './projection.js';

interface ClientConn {
  socket: WebSocket;
  playerId: string | null;
}

export class WsHub {
  wss: WebSocketServer;
  clients = new Set<ClientConn>();
  hub: ServerHub;

  constructor(server: Server, hub: ServerHub) {
    this.hub = hub;
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.wss.on('connection', (socket, req) => this.onConnect(socket, req));
    hub.queue.setBroadcaster((state, events) => this.broadcast(state, events));
  }

  private onConnect(socket: WebSocket, req: IncomingMessage): void {
    const cookies = parseCookie(req.headers.cookie ?? '');
    const playerId = cookies[PLAYER_COOKIE] ?? null;
    const conn: ClientConn = { socket, playerId };
    this.clients.add(conn);
    if (playerId) {
      const game = this.hub.getGame();
      if (game) {
        game.connected[playerId] = true;
      }
    }
    socket.on('close', () => {
      this.clients.delete(conn);
      const game = this.hub.getGame();
      if (game && playerId) {
        game.connected[playerId] = false;
        // No broadcast here — connection state is cosmetic.
      }
    });
    // Send initial state.
    this.sendStateTo(conn);
  }

  broadcast(_state: GameState, events: GameLogEntry[]): void {
    // op_* events are internal replay markers (no human-readable message);
    // skip them in the WS broadcast so they don't clutter the LogFeed UI.
    // They're still written to the per-game .jsonl for replay fidelity.
    const visible = events.filter(e => !e.type.startsWith('op_'));
    for (const c of this.clients) {
      this.sendStateTo(c);
      if (visible.length > 0) this.send(c.socket, { type: 'log', entries: visible });
    }
  }

  /** Force-broadcast state without log entries (used after lobby changes). */
  rebroadcastLobby(): void {
    for (const c of this.clients) this.sendStateTo(c);
  }

  private sendStateTo(c: ClientConn): void {
    const body = this.buildStateResponse(c.playerId);
    this.send(c.socket, { type: 'state', state: body });
  }

  private buildStateResponse(playerId: string | null): StateResponse {
    const mode = this.hub.getMode();
    if (mode === 'lobby') {
      return {
        mode: 'lobby',
        lobby: this.hub.lobbyMembers(),
        canStart: this.hub.lobby.length >= 2
      };
    }
    const game = this.hub.getGame()!;
    const isPlayer = playerId && game.players.some(p => p.playerId === playerId);
    if (!isPlayer) return { mode: 'game_in_progress_spectator' };
    const projected = projectState(game, playerId);
    return mode === 'game_over'
      ? { mode: 'game_over', state: projected }
      : { mode: 'in_game', state: projected };
  }

  private send(socket: WebSocket, msg: ServerWsMessage): void {
    if (socket.readyState !== 1) return;
    try {
      socket.send(JSON.stringify(msg));
    } catch {
      /* ignore */
    }
  }
}
