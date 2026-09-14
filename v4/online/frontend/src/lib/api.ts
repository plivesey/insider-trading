import type {
  AuctionBidRequest,
  FreeActionApiRequest,
  JoinRequest,
  MeResponse,
  PromptResponseRequest,
  StateResponse,
  TurnActionRequest
} from '@insider-trading/shared';

const OVERRIDE_KEY = 'beOverride';

export function getBackendOverride(): string | null {
  try {
    return sessionStorage.getItem(OVERRIDE_KEY);
  } catch {
    return null;
  }
}

export function setBackendOverride(url: string): void {
  // Trim trailing slash so we can append `/api` cleanly.
  const cleaned = url.trim().replace(/\/+$/, '');
  sessionStorage.setItem(OVERRIDE_KEY, cleaned);
}

export function clearBackendOverride(): void {
  sessionStorage.removeItem(OVERRIDE_KEY);
}

function apiBase(): string {
  const override = getBackendOverride();
  return override ? `${override}/api` : '/api';
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Skip the ngrok-free.app browser interstitial for fetch requests.
    'ngrok-skip-browser-warning': 'true'
  };
  const res = await fetch(`${apiBase()}${path}`, {
    credentials: 'include',
    headers,
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
  addBot: () =>
    call<{ playerId: string; name: string }>('/add-bot', { method: 'POST' }),
  turnAction: (req: TurnActionRequest) =>
    call<{ ok: true }>('/turn-action', { method: 'POST', body: JSON.stringify(req) }),
  auctionBid: (req: AuctionBidRequest) =>
    call<{ ok: true }>('/auction-bid', { method: 'POST', body: JSON.stringify(req) }),
  freeAction: (req: FreeActionApiRequest) =>
    call<{ ok: true }>('/free-action', { method: 'POST', body: JSON.stringify(req) }),
  promptResponse: (req: PromptResponseRequest) =>
    call<{ ok: true }>('/prompt-response', { method: 'POST', body: JSON.stringify(req) })
};
