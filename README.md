# Fullstack Bun Starter

A fullstack starter project with a React + Vite single-page app, a Hono API, Postgres through Drizzle, Valkey/Redis rate limiting, and optional S3-compatible storage. The API serves the built SPA in production.

## Quick start

You need Bun 1.4 and Docker with Compose v2 (`--wait`).

```sh
cp .env.example .env
bun install
docker compose up -d --wait
bun run dev
```

Open http://localhost:3000. Vite forwards `/api` to the API. The API also answers http://localhost:3100/api/health and http://localhost:3100/api/ready.

Compose runs Postgres on `127.0.0.1:5432`, Valkey on `127.0.0.1:6379`, and S3Mock on `127.0.0.1:9090`. S3Mock creates `S3_BUCKET` at startup. To use other host ports, set `POSTGRES_PORT`, `REDIS_PORT`, or `S3_PORT` and update the matching `DATABASE_URL`, `REDIS_URL`, or `S3_ENDPOINT`.

The API requires `DATABASE_URL` and `REDIS_URL` and does not start without them. Vite, the API, and the preview script load the root `.env`. If you change `POSTGRES_USER`, `POSTGRES_PASSWORD`, or `POSTGRES_DB`, update `DATABASE_URL`. If you change `API_PORT`, update `API_INTERNAL_URL`. Defaults are `WEB_PORT=3000` and `API_PORT=3100`. Use URL-safe credentials, or percent-encode them in the URL.

The example database and S3 credentials are for local development only. S3Mock accepts any credentials.

Run one app with `bun run dev:api` or `bun run dev:web`. Run `bun run preview` to test the production path locally. It builds the SPA and serves it with the API at http://localhost:3100. It needs the Compose services.

## Layout

- `apps/web` (`@starter/web`): Core frontend with React, Vite, React Router, and TanStack Query. The build output is static files in `apps/web/dist`.
- `apps/api` (`@starter/api`): Core backend API. It serves the built SPA when you set `WEB_DIST_DIR`. Only this package imports the database package or the S3 client.
- `packages/shared` (`@starter/shared`): Shared packages that web and api can use. This starter contain Zod schemas and inferred TypeScript types for HTTP responses.
- `packages/db` (`@starter/db`): Drizzle schema, Bun SQL connection, and migration tooling.

## Rate limiting

Requests use a fixed window per client address. The default is 60 requests per 60 seconds. Set `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_SECONDS` to change it. `/api/health` and `/api/ready` are never limited.

- An exhausted client receives `429` with `{"error":"Too many requests"}` and `Retry-After` in seconds.
- If Valkey is unavailable, limited requests receive `503` with `{"error":"Service unavailable"}`. The API does not bypass the limit.
- SPA documents and static assets are not limited.

The limiter uses the direct connection address. It ignores `X-Forwarded-For` unless the peer matches `TRUSTED_PROXIES`, a comma-separated list of IPv4/IPv6 addresses or CIDR blocks. With a trusted peer, the API uses the rightmost header address that is not a trusted proxy. Set `TRUSTED_PROXIES` before you deploy behind a TLS proxy. A mismatch makes all clients share the proxy address.

## Object storage

`apps/api/src/platform/files/storage.ts` provides a server-only adapter with `upload`, `download`, `remove`, and `copy` over an S3-compatible endpoint.

## SPA serving

In production the API serves the Vite build from `WEB_DIST_DIR`. HTML has `Cache-Control: no-store`. Hashed files under `/assets/*` have `public, max-age=31536000, immutable`. A missing asset returns JSON `404`. Other GET and HEAD paths receive `index.html` for React Router. In development Vite serves the SPA.

## Schema and migrations

The starter has no tables and no migrations. On this pristine state, `bun run db:migrate` reports that there is nothing to apply.

After you define tables in `packages/db/src/schema.ts`, generate and review the SQL:

```sh
bun run db:generate
bun run db:migrate
```

Commit the generated files. Applying migrations needs `DATABASE_URL` and a reachable database. Take a backup before you change a database with valuable data. Migrations are an explicit step, not part of startup or image builds.

## Quality commands

```sh
bun run quality
```

`bun run quality` runs `format:check`, `lint`, `typecheck`, `test`, and `build`, in that order. CI runs the same commands with Bun 1.4 and installs with `bun install --frozen-lockfile`. `bun run format` applies formatting. Commit `bun.lock` after an intentional dependency change. The test suite does not need Postgres, Valkey, or S3Mock.

## Production Compose

`compose.production.yaml` is a separate stack with Postgres 18, Valkey 8, and a non-root Bun API. The API image builds the SPA in a separate stage and copies only the Vite output into the runtime image. One Bun process serves `/api/*` and the SPA.

Supply a long, random, URL-safe database password. This command does not read the development `.env`:

```sh
POSTGRES_PASSWORD='<your-long-random-URL-safe-password>' \
  docker compose --env-file /dev/null -f compose.production.yaml up -d --build --wait
```

Production refuses to start without `POSTGRES_PASSWORD`. `POSTGRES_USER` and `POSTGRES_DB` default to `starter`. Keep these values stable for an existing volume. Do not commit secrets or bake `.env` into images.

Open http://localhost:8080. Only the API publishes a host port, bound to loopback. Set `PROXY_PORT` to change it. `TRUSTED_PROXIES` must name your TLS proxy if it forwards `X-Forwarded-For`.

Both stacks use `postgres:18-alpine` with a `postgres18_data` volume at `/var/lib/postgresql`.

This stack serves plain HTTP for a local production-like deployment. A public deployment needs a TLS reverse proxy and explicit network exposure. Cloud provisioning, TLS automation, authentication, backups, and monitoring are not included. Public status endpoints are not access control for future routes.

## Data and shutdown

Local and production Compose use different project names and separate Postgres volumes. Local Compose also keeps S3Mock data in `s3mock_data`. Valkey is not persisted because rate-limit counters are disposable. Local objects survive `docker compose down`.

`docker compose down` stops a stack without deleting volumes. To stop production and keep its volume, use the same environment values:

```sh
POSTGRES_PASSWORD='<your-existing-production-password>' \
  docker compose --env-file /dev/null -f compose.production.yaml down
```

Never add `--volumes` or `-v` unless you intend to delete database and object data. A volume is not a backup. Maintain and test independent Postgres and object-storage backups. Postgres initialization variables only apply to an empty data directory. Changing a password or database name in `.env` does not change an initialized database.

## License

MIT. See [LICENSE](LICENSE).
