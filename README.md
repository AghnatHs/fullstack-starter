# Fullstack Bun Starter

A Bun workspace with a React + Vite SPA, React Router, TanStack Query, a Hono API, Postgres through Drizzle's Bun SQL driver, Valkey/Redis-backed API rate limiting, and optional S3-compatible object storage. The API serves the built SPA in production. The native, unstyled web page reports real API and database status. There is no server-side rendering.

There is no authentication, authorization, demo domain, CRUD example, seed data, or application table. Both status endpoints are public. The initial schema and migration history are intentionally empty.

## Local development

Install Bun 1.4 and Docker with Compose v2 (`--wait` support required). From this directory:

```sh
cp .env.example .env
bun install
docker compose up -d --wait
bun run dev
```

Open http://localhost:3000. Vite forwards browser requests under `/api` to the API. You can also open http://localhost:3100/api/health and http://localhost:3100/api/ready directly.

Local Compose runs Postgres, Valkey, and S3Mock on loopback ports. Postgres is on `127.0.0.1:5432`, Valkey on `127.0.0.1:6379`, and S3Mock on `127.0.0.1:9090`. S3Mock creates `S3_BUCKET` at startup. Set `POSTGRES_PORT`, `REDIS_PORT`, or `S3_PORT` in `.env` to use other host ports, and update `DATABASE_URL`, `REDIS_URL`, or `S3_ENDPOINT` to match. Bun runs the API and web app on your host.

The API requires `DATABASE_URL` and `REDIS_URL` and refuses to start without them. Vite, the API, and the preview script load the root `.env`. If you change `POSTGRES_USER`, `POSTGRES_PASSWORD`, or `POSTGRES_DB`, update `DATABASE_URL` to match. If you change `API_PORT`, update the development proxy's `API_INTERNAL_URL` to match. `WEB_PORT` defaults to `3000`; `API_PORT` defaults to `3100`. Use URL-safe credentials or percent-encode credentials when writing a database URL.

The example database credentials (`starter` / `starter-local-only`) and S3 credentials are for local development only. S3Mock accepts any credentials; the values in `.env` are placeholders.

Run either app separately with `bun run dev:api` or `bun run dev:web`. To inspect the production-style single-process deployment locally:

```sh
bun run preview
```

This builds the SPA, then starts the API with `WEB_DIST_DIR` pointing at `apps/web/dist`, so the API serves the application at http://localhost:3100. It needs the Compose services (at least Valkey) running. This is the same serving path used in production.

Postgres must be running for readiness to report healthy, but the API does not require a database connection to start. The API also starts when Valkey is unreachable; API requests then fail closed until it recovers.

## Package boundaries

- `apps/web` (`@starter/web`): React, Vite, React Router, and TanStack Query. `src/main.tsx` owns the Query client and browser router; `src/app.tsx` defines the routes. The build output is static files in `apps/web/dist`.
- `apps/api` (`@starter/api`): Hono API on its own Bun process. It serves the built SPA when `WEB_DIST_DIR` is set. Only the API imports the database package or the S3 client.
- `packages/shared` (`@starter/shared`): Zod schemas and inferred TypeScript types for HTTP responses, shared by web and API. There is no Hono RPC or generated client.
- `packages/db` (`@starter/db`): Drizzle schema, Bun SQL connection, and migration tooling. No browser code imports this package.

The API is organized by responsibility:

```
apps/api/src/
├── index.ts                 process startup and shutdown
├── app.ts                   createApp composition and dependencies
├── config.ts                validated environment configuration
├── lib/                     errors, client IP trust, rate limiting, SPA serving
├── middleware/              error handling, API caching, rate limiting
└── platform/
    ├── health/              /api/health and /api/ready
    └── files/               S3-compatible object storage adapter
```

`createApp` accepts its dependencies (database check, rate limiter, trusted proxies, optional SPA directory, request logging) instead of importing process-level singletons. Tests build the app without Postgres, Valkey, or S3.

Browser requests always use same-origin `/api/*`. Vite uses `API_INTERNAL_URL` as its development proxy target; production serves the SPA and the API from the same Bun process. No internal URL or storage credential is needed by the browser. Builds do not need a running API or database.

## Status API and outages

| Request                                | HTTP status | JSON body                                  |
| -------------------------------------- | ----------- | ------------------------------------------ |
| `GET /api/health`                      | `200`       | `{"status":"ok"}`                          |
| `GET /api/ready`, database reachable   | `200`       | `{"status":"ready","database":"up"}`       |
| `GET /api/ready`, database unavailable | `503`       | `{"status":"not_ready","database":"down"}` |

Health is process liveness; readiness executes `SELECT 1`. A database outage does not stop the API process or change liveness. Readiness and the web status page show degradation, and subsequent requests can recover when the database returns. Responses do not reveal raw database errors, and status responses are not cached. Readiness stays database-only; it does not report Valkey health.

The web app validates API payloads with the shared Zod schemas. TanStack Query owns the health/readiness cache and loading/error states. The two checks load independently, and Refresh status invalidates both. A valid readiness `503` is displayed as a database outage, not an API transport failure. Failed refreshes show an error instead of presenting previously cached results as current. Queries do not poll, retry automatically, or refetch on window focus or reconnect; requests run on mount and manual refresh. Refresh stays in a loading state until the requests finish. The production API healthcheck uses readiness, so a database outage marks the container unhealthy. Docker does not restart a container solely because its healthcheck fails.

Unknown API routes return JSON `404`. Unexpected API errors return generic JSON `500`. Every `/api/*` response carries `Cache-Control: no-store`.

## Rate limiting

API requests are limited with a fixed window per client address. The default is 60 requests per 60 seconds, configurable with `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_SECONDS`. `/api/health` and `/api/ready` are never limited, so probes cannot exhaust or trip the limiter.

- Exhausted clients receive `429` with a JSON body `{"error":"Too many requests"}` and a `Retry-After` header in seconds.
- If Valkey is unavailable, limited API requests receive `503` with `{"error":"Service unavailable"}` instead of bypassing the limit.
- SPA documents and static assets are not rate-limited.

The limiter keys on the direct connection address by default. `X-Forwarded-For` is ignored unless the immediate peer matches an entry in `TRUSTED_PROXIES` (comma-separated IPv4/IPv6 addresses or CIDR blocks). When the peer is trusted, the API walks the header from right to left and uses the rightmost address that is not itself a trusted proxy. Set `TRUSTED_PROXIES` to your TLS proxy's address or network before deploying behind one. Using a mismatched value makes every client share the proxy's address; leaving it empty behind a proxy has the same effect.

Rate-limit counters live only in Valkey and expire with the window. Redis persistence is not required for correctness.

## Object storage

`apps/api/src/platform/files/storage.ts` provides a server-only storage adapter with `upload`, `download`, `remove`, and `copy` operations over an S3-compatible endpoint. There are no HTTP upload or download routes; adding any requires an access-control decision.

`createStorageFromEnv()` reads `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_FORCE_PATH_STYLE`, and validates the complete set when it is called. The API does not construct storage at startup, so it starts without S3 configuration and fails clearly only when a consumer asks for storage. `S3_FORCE_PATH_STYLE` defaults to `true`, which works with path-style endpoints such as S3Mock and MinIO, and with AWS S3.

Local S3Mock is ready at `S3_ENDPOINT`, and it creates `S3_BUCKET` at startup. It does not validate credentials. Production uses an externally managed S3-compatible service; supply the `S3_*` variables to the production stack when you begin using storage.

## SPA serving

In production the API serves the Vite build from `WEB_DIST_DIR` in the same process as `/api/*`. HTML is sent with `Cache-Control: no-store`. Hashed files under `/assets/*` are sent with `public, max-age=31536000, immutable`. A missing asset never receives the SPA document; it returns JSON `404`. Unknown `/api` paths also return JSON `404`, and non-GET requests are not treated as client routes. Other GET and HEAD paths receive `index.html` so React Router can render the requested screen.

In development Vite serves the SPA and the API only handles `/api/*`, because `WEB_DIST_DIR` is unset. The API never serves a stale build unless you point `WEB_DIST_DIR` at one.

## Schema and migrations

The template has no application tables and no historical migrations. On this pristine state, `bun run db:migrate` reports that there is nothing to apply; it does not invent a demo migration. Readiness does not create tables.

After defining your tables in `packages/db/src/schema.ts`, generate and review SQL before applying it:

```sh
bun run db:generate
bun run db:migrate
```

Commit the generated migration files. Generation uses the schema; applying migrations needs `DATABASE_URL` and a reachable database. Take a backup before changing a database with valuable data. Migrations are an explicit operation, not part of application startup or image builds. Plan a separate migration step with access to your production database when you add a real schema.

## Quality commands

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
```

`bun run format` applies formatting. CI installs with `bun install --frozen-lockfile` and runs the checks above with Bun 1.4. Commit `bun.lock` after intentional dependency changes. The basic test suite does not require Postgres, Valkey, or S3Mock. No pre-commit hooks are installed.

Biome formats JavaScript, TypeScript, JSX, and JSON; ESLint handles linting and workspace import boundaries. Migrations, dependencies, and build output are excluded from formatting. TypeScript stays on 6.x because typescript-eslint does not yet support the TypeScript 7 compiler API.

## Production Compose

`compose.production.yaml` is a separate stack, not an override of local Compose. It runs exactly three services: Postgres 18, Valkey 8, and a non-root Bun API. The API image builds the SPA in a separate stage with frozen dependencies, then copies only the Vite output into the runtime image. The same Bun process serves `/api/*` and the SPA. There is no separate web or proxy service.

Both Compose stacks use `postgres:18-alpine` and mount a version-specific `postgres18_data` volume at `/var/lib/postgresql`. The image stores its cluster under `/var/lib/postgresql/18/docker`. Do not attach a Postgres 17 data directory to Postgres 18; migrate existing data through a supported PostgreSQL upgrade or dump/restore procedure.

Supply your own long, random, URL-safe database password. Replace the placeholder below before running the command. `--env-file /dev/null` deliberately prevents Compose from reading the development `.env`; the password comes from the process environment instead:

```sh
POSTGRES_PASSWORD='<your-long-random-URL-safe-password>' \
  docker compose --env-file /dev/null -f compose.production.yaml up -d --build --wait
```

Use only URL-safe characters for this password because Compose embeds it in `DATABASE_URL`. Production refuses to start without `POSTGRES_PASSWORD`; it has no default password. `POSTGRES_USER` and `POSTGRES_DB` default to `starter` and can be supplied in the environment. Keep these values stable for an existing volume. Do not commit secrets or bake `.env` into images.

Open http://localhost:8080. Only the API publishes a host port, bound to loopback by default; Postgres and Valkey have no host ports. Set `PROXY_PORT` in the process environment to change `8080`. The API serves the SPA and API from that single port. Hashed assets use immutable caching; HTML is not cached.

Additional production variables:

- `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_SECONDS` default to `60` and `60`.
- `TRUSTED_PROXIES` must name your TLS proxy address or network if it forwards `X-Forwarded-For`.
- `S3_*` is optional until a storage consumer exists; production storage is external to this stack.

This configuration serves plain HTTP for a local production-like deployment. A public deployment needs an appropriately configured TLS reverse proxy in front of it and explicit network exposure. Cloud provisioning, TLS automation, authentication, backups, and monitoring are not provided. Do not mistake public status endpoints for access control for future application routes.

## Data persistence and shutdown

Local and production Compose use different project names and separate named Postgres volumes. Local Compose also keeps S3Mock data in `s3mock_data`. Valkey is intentionally not persisted because rate-limit counters are disposable. Locally saved objects survive `docker compose down` with the S3Mock volume; production objects live in your external S3 service.

`docker compose down` stops the local stack without deleting its volumes. To stop production while preserving its volume, provide the same production environment values and run:

```sh
POSTGRES_PASSWORD='<your-existing-production-password>' \
  docker compose --env-file /dev/null -f compose.production.yaml down
```

Never add `--volumes` (or `-v`) unless you intend to delete database and object data. Avoid volume pruning when keeping data matters. Container rebuilds and restarts preserve named volumes, but a volume is not a backup: maintain and test independent Postgres and object-storage backups.

Postgres initialization environment variables only take effect on an empty data directory. Editing a password or database name in `.env` does not change an initialized database. Change database roles/credentials deliberately and update the connection URL together; do not delete a volume to resolve a credential mismatch unless all its data is disposable.

## License

MIT. See [LICENSE](LICENSE).
