import type { Request, Response, NextFunction } from 'express';
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const ok = (
  res: Response,
  data: unknown,
  message = 'Operation completed successfully',
  status = 200,
) => res.status(status).json({ success: true, data, message });
export const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);
export const parse = <T>(schema: { parse: (value: unknown) => T }, value: unknown): T =>
  schema.parse(value);
