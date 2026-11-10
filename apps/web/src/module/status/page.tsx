import { useQuery, useQueryClient } from '@tanstack/react-query';
import { healthQuery, readinessQuery } from './queries';

export function StatusPage() {
  const health = useQuery(healthQuery);
  const readiness = useQuery(readinessQuery);
  const queryClient = useQueryClient();
  const fetching = health.isFetching || readiness.isFetching;
  const failed = health.isError || readiness.isError;

  return (
    <main>
      <h1>Fullstack Bun Starter</h1>
      <h2>Service status</h2>
      <div aria-live="polite" aria-atomic="true" aria-busy={fetching}>
        <dl>
          <dt>API health</dt>
          <dd>
            {health.isPending
              ? 'Checking API health...'
              : health.isError
                ? 'Unavailable. Could not retrieve a valid response. The API may be unavailable.'
                : 'Healthy'}
          </dd>
          <dt>Database readiness</dt>
          <dd>
            {readiness.isPending
              ? 'Checking database readiness...'
              : readiness.isError
                ? 'Unknown. Could not retrieve a valid response. The API may be unavailable.'
                : readiness.data.status === 'ready'
                  ? 'Ready. Database is reachable.'
                  : 'Not ready. Database is unavailable.'}
          </dd>
        </dl>
      </div>
      <p>The API health check does not depend on the database.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!fetching) void queryClient.invalidateQueries({ queryKey: ['status'] });
        }}
      >
        <button type="submit" disabled={fetching}>
          {fetching ? 'Checking status...' : 'Refresh status'}
        </button>
      </form>
      <p role="status">
        {fetching
          ? 'Checking API health and database readiness...'
          : failed
            ? 'Status check failed. Refresh to try again.'
            : 'Status reflects the most recent check. Refresh to check again.'}
      </p>
      <h2>API responses</h2>
      <ul>
        <li>
          <a href="/api/health">API health JSON</a>
        </li>
        <li>
          <a href="/api/ready">Database readiness JSON</a>
        </li>
      </ul>
    </main>
  );
}
