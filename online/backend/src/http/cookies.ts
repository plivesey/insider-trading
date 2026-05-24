import type { Request, Response } from 'express';
import { PLAYER_COOKIE } from '@insider-trading/shared';

export function readPlayerCookie(req: Request): string | null {
  const fromCookies = (req as Request & { cookies?: Record<string, string> }).cookies?.[PLAYER_COOKIE];
  if (fromCookies) return fromCookies;
  return null;
}

export function setPlayerCookie(res: Response, playerId: string): void {
  res.cookie(PLAYER_COOKIE, playerId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // plain HTTP playtest tool — see PLAN.md
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  });
}
