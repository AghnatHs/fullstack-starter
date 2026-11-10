# Coding agent instructions

Before adding or moving application code, changing imports or public interfaces, or changing business behavior, read [ARCHITECTURE.md](ARCHITECTURE.md). It is the source of truth for module placement, cross-module calls, transaction ownership, and import rules.

Use [README.md](README.md) for environment setup and operational constraints. Discover runnable commands in the root and workspace `package.json` files.

## Working sequence

1. Identify the owning module and read its public index and relevant implementation before editing. For a new capability, choose its business name and intended public operations first.
2. Follow the architecture conventions across every affected caller, contract, and table. Keep the starter free of sample business modules and mandatory empty layers.
3. Verify the changed behavior, then run the repository quality command. Import-policy changes also require the lint rule's behavior tests. Report checks actually run and any unavailable runtime prerequisites.
4. Update the architecture document when conventions change; keep this entrypoint a pointer rather than a duplicate rulebook.

## Agent skills

### Issue tracker

Issues and specs live in local markdown under `.scratch/`. Before reading or publishing tickets, read `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage roles. Before triaging issues, read `docs/agents/triage-labels.md`.

### Domain docs

Multi-context: root `GLOSSARY-MAP.md` links context glossaries. Before exploring domain concepts or proposing decisions, read `docs/agents/domain.md`.
