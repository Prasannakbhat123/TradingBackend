import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  console.error('[error]', err);
  const message = err instanceof Error ? err.message : 'Internal server error';
  const status = message.includes('not found') ? 404 : message.includes('Forbidden') ? 403 : 400;
  res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
