FROM oven/bun:1.4 AS manifests
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/shared/package.json ./packages/shared/package.json

FROM manifests AS dependencies
RUN bun install --frozen-lockfile --production

FROM manifests AS web
RUN bun install --frozen-lockfile
COPY tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/shared ./packages/shared
RUN bun run --cwd apps/web build

FROM oven/bun:1.4 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV WEB_DIST_DIR=/app/apps/web/dist
COPY --from=dependencies --chown=bun:bun /app /app
COPY --chown=bun:bun apps/api/src ./apps/api/src
COPY --chown=bun:bun packages/db/src ./packages/db/src
COPY --chown=bun:bun packages/shared/src ./packages/shared/src
COPY --from=web --chown=bun:bun /app/apps/web/dist ./apps/web/dist
USER bun
WORKDIR /app/apps/api
EXPOSE 3100
CMD ["bun", "src/index.ts"]
