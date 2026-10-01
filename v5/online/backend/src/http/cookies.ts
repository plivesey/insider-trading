import type { Request, Response } from 'express';
import { PLAYER_COOKIE } from '@insider-trading/shared';

export function readPlayerCookie(req: Request): string | null {
  const fromCookies = (req as Request & { cookies?: Record<string, string> }).cookies?.[PLAYER_COOKIE];
  if (fromCookies) return fromCookies;
  return null;
}

export function setPlayerCookie(res: Response, playerId: string): void {
  // When the request arrived over HTTPS (e.g. via an ngrok tunnel), the cookie
  // is being set from a cross-origin response, so it must be SameSite=None +
  // Secure to be accepted by the browser. On plain-HTTP localhost playtests
  // fall back to Lax/non-secure.
  const isHttps = res.req.secure;
  res.cookie(PLAYER_COOKIE, playerId, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });
}
