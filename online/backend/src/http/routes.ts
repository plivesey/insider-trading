import { Router, type Request, type Response } from 'express';
import type {
  AuctionBidRequest,
  FreeActionApiRequest,
  GameLogEntry,
  JoinRequest,
  PromptResponseRequest,
  StateResponse,
  TurnActionRequest
} from '@insider-trading/shared';
import { readPlayerCookie, setPlayerCookie } from './cookies.js';
import { projectState } from './projection.js';
import type { ServerHub } from '../state/serverState.js';
import { sellStock } from '../engine/turn.js';
import { startAuction, bid, pass } from '../engine/auction.js';
import { submitFreeAction } from '../engine/freeActions.js';
import { respondToPrompt } from '../engine/promptResponse.js';
import { advance } from '../engine/advance.js';
import { event } from '../engine/events.js';
import { kickBots } from '../bots/runner.js';

export function createRouter(hub: ServerHub): Router {
  const r = Router();

  function fail(res: Response, status: number, error: string): Response {
    return res.status(status).json({ error });
  }

  r.get('/me', (req, res) => {
    const playerId = readPlayerCookie(req);
    if (!playerId) return res.json({ playerId: null, name: null, inGame: false, inLobby: false });
    const entry = hub.findPlayerByCookie(playerId);
    if (!entry) return res.json({ playerId, name: null, inGame: false, inLobby: false });
    const game = hub.getGame();
    return res.json({
      playerId: entry.playerId,
      name: entry.name,
      inGame: !!(game && game.players.some(p => p.playerId === entry.playerId)),
      inLobby: hub.lobby.some(p => p.playerId === entry.playerId)
    });
  });

  r.post('/join', (req, res) => {
    const body = req.body as JoinRequest;
    const existingCookie = readPlayerCookie(req);
    const result = hub.join(body?.name, existingCookie ?? undefined);
    if ('error' in result) return fail(res, 400, result.error);
    setPlayerCookie(res, result.playerId);
    return res.json({ playerId: result.playerId, name: result.name });
  });

  r.post('/start', async (_req, res) => {
    const r2 = await hub.startGame(undefined);
    if (!r2.ok) return fail(res, 400, r2.error ?? 'cannot start');
    // Game just started; if any bot got the first turn, give it a kick.
    kickBots(hub);
    return res.json({ ok: true });
  });

  r.post('/add-bot', (_req, res) => {
    const result = hub.addBot();
    if ('error' in result) return fail(res, 400, result.error);
    return res.json({ playerId: result.playerId, name: result.name });
  });

  r.post('/reset', (_req, res) => {
    hub.reset();
    return res.json({ ok: true });
  });

  r.get('/state', (req, res) => {
    const playerId = readPlayerCookie(req);
    const mode = hub.getMode();
    if (mode === 'lobby') {
      const body: StateResponse = {
        mode: 'lobby',
        lobby: hub.lobbyMembers(),
        canStart: hub.lobby.length >= 2
      };
      return res.json(body);
    }
    const game = hub.getGame()!;
    const isPlayer = playerId && game.players.some(p => p.playerId === playerId);
    if (!isPlayer) {
      const body: StateResponse = { mode: 'game_in_progress_spectator' };
      return res.json(body);
    }
    const projected = projectState(game, playerId);
    const body: StateResponse =
      mode === 'game_over'
        ? { mode: 'game_over', state: projected }
        : { mode: 'in_game', state: projected };
    return res.json(body);
  });

  r.post('/turn-action', async (req, res) => {
    const playerId = readPlayerCookie(req);
    if (!playerId) return fail(res, 401, 'cookie required');
    const body = req.body as TurnActionRequest;
    if (!body) return fail(res, 400, 'body required');
    const result = await hub.queue.run('turn_action', state => {
      let mut;
      const opEvents: GameLogEntry[] = [];
      if (body.type === 'start_auction') {
        opEvents.push(event('op_start_auction', '', { actor: playerId, payload: { cardUid: body.cardUid, initialBid: body.initialBid } }));
        mut = startAuction(state, playerId, body.cardUid, body.initialBid);
      } else if (body.type === 'sell_stock') {
        opEvents.push(event('op_sell_stock', '', { actor: playerId, payload: { stockUid: body.stockUid } }));
        mut = sellStock(state, playerId, body.stockUid);
      } else {
        return { ok: false, error: 'unknown turn action type', events: [] };
      }
      if (mut.ok) {
        mut.events = [...opEvents, ...mut.events];
        advance(state, mut.events);
      }
      return mut;
    });
    if (!result.ok) return fail(res, 400, result.error ?? 'failed');
    return res.json({ ok: true });
  });

  r.post('/auction-bid', async (req, res) => {
    const playerId = readPlayerCookie(req);
    if (!playerId) return fail(res, 401, 'cookie required');
    const body = req.body as AuctionBidRequest;
    if (!body) return fail(res, 400, 'body required');
    const result = await hub.queue.run('auction_bid', state => {
      const opEvent: GameLogEntry =
        body.type === 'bid'
          ? event('op_auction_bid', '', { actor: playerId, payload: { amount: body.amount } })
          : event('op_auction_pass', '', { actor: playerId });
      const mut =
        body.type === 'bid'
          ? bid(state, playerId, body.amount)
          : pass(state, playerId);
      if (mut.ok) {
        mut.events = [opEvent, ...mut.events];
        advance(state, mut.events);
      }
      return mut;
    });
    if (!result.ok) return fail(res, 400, result.error ?? 'failed');
    return res.json({ ok: true });
  });

  r.post('/free-action', async (req, res) => {
    const playerId = readPlayerCookie(req);
    if (!playerId) return fail(res, 401, 'cookie required');
    const body = req.body as FreeActionApiRequest;
    if (!body?.request) return fail(res, 400, 'request required');
    const result = await hub.queue.run('free_action', state => {
      const opEvent = event('op_free_action', '', { actor: playerId, payload: { request: body.request } });
      const mut = submitFreeAction(state, playerId, body.request);
      if (mut.ok) {
        mut.events = [opEvent, ...mut.events];
        advance(state, mut.events);
      }
      return mut;
    });
    if (!result.ok) return fail(res, 400, result.error ?? 'failed');
    return res.json({ ok: true });
  });

  r.post('/prompt-response', async (req, res) => {
    const playerId = readPlayerCookie(req);
    if (!playerId) return fail(res, 401, 'cookie required');
    const body = req.body as PromptResponseRequest;
    if (!body?.promptId) return fail(res, 400, 'promptId required');
    const result = await hub.queue.run('prompt_response', state => {
      const opEvent = event('op_prompt_response', '', { actor: playerId, payload: { promptId: body.promptId, response: body.response ?? {} } });
      const mut = respondToPrompt(state, playerId, body.promptId, body.response ?? {});
      if (mut.ok) {
        mut.events = [opEvent, ...mut.events];
        advance(state, mut.events);
      }
      return mut;
    });
    if (!result.ok) return fail(res, 400, result.error ?? 'failed');
    return res.json({ ok: true });
  });

  return r;
}
