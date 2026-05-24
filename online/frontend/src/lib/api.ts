import type {
  AuctionBidRequest,
  FreeActionApiRequest,
  JoinRequest,
  MeResponse,
  PromptResponseRequest,
  StateResponse,
  TurnActionRequest
} from '@insider-trading/shared';

const BASE = '/api';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  me: () => call<MeResponse>('/me'),
  state: () => call<StateResponse>('/state'),
  join: (name: string) =>
    call<{ playerId: string; name: string }>('/join', {
      method: 'POST',
      body: JSON.stringify({ name } satisfies JoinRequest)
    }),
  start: () => call<{ ok: true }>('/start', { method: 'POST' }),
  reset: () => call<{ ok: true }>('/reset', { method: 'POST' }),
  turnAction: (req: TurnActionRequest) =>
    call<{ ok: true }>('/turn-action', { method: 'POST', body: JSON.stringify(req) }),
  auctionBid: (req: AuctionBidRequest) =>
    call<{ ok: true }>('/auction-bid', { method: 'POST', body: JSON.stringify(req) }),
  freeAction: (req: FreeActionApiRequest) =>
    call<{ ok: true }>('/free-action', { method: 'POST', body: JSON.stringify(req) }),
  promptResponse: (req: PromptResponseRequest) =>
    call<{ ok: true }>('/prompt-response', { method: 'POST', body: JSON.stringify(req) })
};
