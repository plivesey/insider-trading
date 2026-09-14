import type { LobbyMember, ProjectedGameState, GameLogEntry, FreeActionRequest } from './state.js';

// ---------- REST request/response shapes ----------

export interface JoinRequest { name: string; }
export interface JoinResponse { playerId: string; name: string; }

export interface MeResponse {
  playerId: string;
  name: string;
  inGame: boolean;
  inLobby: boolean;
}

export type StateResponse =
  | { mode: 'lobby'; lobby: LobbyMember[]; canStart: boolean }
  | { mode: 'game_in_progress_spectator' }
  | { mode: 'in_game'; state: ProjectedGameState }
  | { mode: 'game_over'; state: ProjectedGameState };

export interface StartRequest {}
export interface ResetRequest {}
export interface AddBotRequest {}
export interface AddBotResponse { playerId: string; name: string; }

export type TurnActionRequest =
  | { type: 'start_auction'; cardUid: string; initialBid: number }
  | { type: 'sell_stock'; stockUid: string };

export type AuctionBidRequest =
  | { type: 'bid'; amount: number }
  | { type: 'pass' };

export interface FreeActionApiRequest {
  request: FreeActionRequest;
}

export interface PromptResponseRequest {
  promptId: string;
  response: Record<string, unknown>;
}

export interface ErrorBody { error: string; }

// ---------- WebSocket message envelopes ----------

export type ServerWsMessage =
  | { type: 'state'; state: StateResponse }
  | { type: 'log'; entries: GameLogEntry[] }
  | { type: 'error'; error: string };

export type ClientWsMessage = { type: 'hello' };

// ---------- Cookie ----------
export const PLAYER_COOKIE = 'itPlayerId';
