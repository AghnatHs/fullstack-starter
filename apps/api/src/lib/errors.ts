import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly headers: Record<string, string> | undefined;

  constructor(status: ContentfulStatusCode, message: string, headers?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.headers = headers;
  }
}
