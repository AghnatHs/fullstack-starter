import { queryOptions } from '@tanstack/react-query';
import { HealthSchema, ReadinessSchema } from '@starter/shared';

async function requestStatus<T>(
  url: string,
  parse: (data: unknown) => T,
  accepts: (status: number, data: T) => boolean,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    headers: { Accept: 'application/json' },
  });
  const data = parse(await response.json());
  if (!accepts(response.status, data)) {
    throw new Error('The API returned an unexpected response.');
  }
  return data;
}

export const healthQuery = queryOptions({
  queryKey: ['status', 'health'],
  queryFn: ({ signal }) =>
    requestStatus(
      '/api/health',
      (data) => HealthSchema.parse(data),
      (status) => status === 200,
      signal,
    ),
});

export const readinessQuery = queryOptions({
  queryKey: ['status', 'readiness'],
  queryFn: ({ signal }) =>
    requestStatus(
      '/api/ready',
      (data) => ReadinessSchema.parse(data),
      (status, data) =>
        (status === 200 && data.status === 'ready') ||
        (status === 503 && data.status === 'not_ready'),
      signal,
    ),
});
