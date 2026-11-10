# Domain Docs

## Before exploring, read these

- Root `GLOSSARY-MAP.md`: follow its links to each context's `GLOSSARY.md` relevant to the topic.
- Root `docs/adr/`: read system-wide ADRs that touch the area being explored.
- Context-scoped ADR directories identified by the map, conventionally `docs/adr/` beside each context's glossary: read relevant decisions.

If these files or directories do not exist, proceed silently. Do not flag their absence or suggest creating them upfront. `/domain-modeling`, also reached through `/grill-with-docs` and `/improve-codebase-architecture`, creates them lazily when terms or decisions get resolved.

## Layout: multi-context

`GLOSSARY-MAP.md` at the repository root is the index of business contexts and their glossary and ADR paths. `docs/adr/` at the root holds system-wide decisions. Each context has its own `GLOSSARY.md` and context-scoped ADRs.

Use the map's actual paths rather than assuming `src/<context>/`. This repository has `apps/` and `packages/` workspaces; workspace packages are not automatically distinct business contexts. Keep context placement consistent with `ARCHITECTURE.md`.

## Use the glossary's vocabulary

When naming a domain concept in an issue title, refactor proposal, hypothesis, or test name, use the term from the relevant glossary. Respect context-specific meanings and avoid synonyms the glossary explicitly rejects.

If a concept is missing, reconsider whether the project uses that language. Note a genuine gap for `/domain-modeling`.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, identify the ADR and explain why reopening the decision is warranted instead of silently overriding it.
