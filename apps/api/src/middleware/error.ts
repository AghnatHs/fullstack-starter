import type { ErrorHandler, NotFoundHandler } from 'hono';
import { AppError } from '../lib/errors';

export const handleError: ErrorHandler = (error, c) => {
  if (error instanceof AppError) {
    for (const [name, value] of Object.entries(error.headers ?? {})) c.header(name, value);
    return c.json({ error: error.message }, error.status);
  }

  console.error(error);
  return c.json({ error: 'Internal server error' }, 500);
};

export const handleNotFound: NotFoundHandler = (c) => c.json({ error: 'Not found' }, 404);
