# Business-first modules

This starter is a modular monolith. Organize application behavior by business capability, with technical layers inside a module only when they earn their place. Keep one backend deployment and one database; modules communicate through explicit public operations, not internal HTTP requests.

## Placement

| Location                         | Responsibility                                                  |
| -------------------------------- | --------------------------------------------------------------- |
| `apps/api/src/module/<name>/`    | Server-side behavior for a capability                           |
| `apps/web/src/module/<name>/`    | Screens, queries, and feature-specific UI for a capability      |
| Application `app.ts` / `app.tsx` | Route assembly and application-wide middleware                  |
| `apps/api/src/index.ts`          | Runtime resources, startup, and shutdown                        |
| Application `lib/`               | Business-independent utilities and infrastructure adapters      |
| Application `middleware/`        | Application-wide HTTP concerns                                  |
| `packages/shared/src/`           | Client-safe HTTP schemas, inferred types, and pure domain rules |
| `packages/db/src/`               | Database connection, tables, and migrations                     |

Use the same business name across API, web, shared contracts, and database schema when they represent the same capability. Different names are appropriate for different responsibilities: the backend's `health` module supports the frontend's `status` feature.

The current examples are intentionally small:

```text
apps/api/src/module/health/
  index.ts
  routes.ts

apps/web/src/module/status/
  index.ts
  page.tsx
  queries.ts
```

A larger module may add `service.ts`, feature-specific middleware, or named implementation files such as `pricing.ts`. Add files when behavior needs them, not to satisfy a template. Avoid global business `services/`, `controllers/`, and `repositories/` directories. Generic storage belongs in `lib/`; rules governing a business document belong in its module.

Shared contracts and database tables are still small single files. Split them by business name as features arrive, rather than creating empty folders now. When introducing shared subpath imports, declare their package exports. Keep database row types server-side; define client contracts in `@starter/shared` instead of exposing persistence structure.

## Public interfaces

Each application module has an `index.ts` with explicit named exports. Export the route factory, screen, business operations, and types that outside callers actually need. Keep implementation helpers private.

```ts
// Application composition:
import { createHealthRoutes } from './module/health';

// Inside the health module:
export { createHealthRoutes } from './routes';
```

Import a different module through its directory or explicit `index.ts`, including for type-only imports, re-exports, and dynamic imports. Inside a module, import its own implementation files directly rather than going back through its public index. Public indices use named exports, not `export *`.

Module-internal tests may live beside their implementation and use internal seams. Tests outside the module exercise its public interface or assembled HTTP behavior. Application assembly may import modules; technical utilities and application-wide middleware may not.

## Cross-module operations

Dependencies between business modules are expected. An order module can call inventory's `reserveStock` and accounting's `recordOrder`, exported through their respective indices. Each receiving module owns its preconditions, state transitions, and writes. Call a business operation rather than reproducing its rules or writing its tables from another module.

Keep the dependency graph acyclic. Pass identifiers and required values instead of making inventory import orders just to look up order details. If a process belongs to neither participating module, give that process a business name, such as `checkout`, and let it coordinate them. Add orchestration only when a real process needs it.

Inject dependencies explicitly at the point of composition, following `createApp(deps)`. Keep runtime clients and lifecycle management at startup. Avoid global dependency containers, import-time business side effects, and event buses introduced only to avoid a direct function call.

### Transactions and external effects

For a use case requiring all-or-nothing changes in the same database, its coordinator owns one transaction. Pass the transaction-scoped database executor explicitly to each participating operation; each operation uses that executor for its reads and writes. Do not silently open independent transactions or use the global connection inside those operations.

A shared transaction does not transfer ownership of another module's rules or tables. Keep external network effects outside a database transaction. When a committed database change must reliably trigger an external effect, design delivery, idempotency, and failure recovery explicitly; a transactional outbox is one option. A database rollback cannot undo an external accounting or payment request.

## Enforced import rules

`bun run lint` checks resolved source targets, including configured TypeScript aliases, rather than relying on folder names inside import strings:

- Code outside a module enters through its public index; same-module implementation imports are allowed.
- Module public indices use explicit exports.
- Application `lib/` and application-wide `middleware/` do not import business modules.
- Web code does not import the backend or database package.
- Backend code does not import web code.
- Shared code does not import application code or the database package.

These rules also cover type-only imports, re-exports, literal dynamic imports, and direct `require(...)` calls. Unresolved targets and computed import specifiers are not analyzed. Keep internal imports statically resolvable; do not use computed imports or indirect `require` calls to bypass the policy.

Lint cannot establish business ownership, inspect SQL intent, ensure transaction propagation, or prove an acyclic module graph. Review those explicitly. Passing lint is necessary, not proof that responsibilities are placed correctly.

## Adding or changing a feature

1. Choose the capability that owns the rule. Extend an existing module when it owns the behavior; create a named module only for a distinct responsibility.
2. Identify its public operations, inputs, errors, authorization preconditions, and transaction requirements. Keep HTTP parsing in routes and business rules in the owning module.
3. Put feature-specific web code alongside its screens and queries. Keep global route assembly in `app.tsx` and browser/server contracts in shared code.
4. Update affected callers through public indices. Preserve dependency direction and table ownership; remove obsolete paths instead of adding compatibility re-exports.
5. Verify changed behavior through the public interface or HTTP route. Add regression coverage for meaningful failures, transitions, and concurrency-sensitive invariants. Verify changed screens in the browser.
6. Run the relevant tests and `bun run quality` before submitting. Update documentation when an interface or convention changes.

Review questions: Does the module own this rule? Is its public interface sufficient? Can a caller bypass its invariants? Is the dependency direction clear? Do all writes that must succeed together share one transaction?
