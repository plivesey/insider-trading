import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Express 4 does not catch rejected promises from async route handlers —
// an unhandled rejection there hangs the client and can crash the process.
// Wrap every async handler with this so errors reach the error middleware.
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
