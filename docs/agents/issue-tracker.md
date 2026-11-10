# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`.
- The spec is `.scratch/<feature-slug>/spec.md`.
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file.
- Triage state is recorded as a `Status:` line near the top of each issue file. Use the role strings in `triage-labels.md`.
- Comments and conversation history append to the bottom of the file under a `## Comments` heading.

## When a skill says "publish to the issue tracker"

Create the spec or individual issue files at the paths above, creating directories as needed.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. If given only a ticket number, resolve it within the relevant feature directory.

## Wayfinding operations

Used by `/wayfinder`. The map is a file with one child file per ticket. Wayfinding tickets use the lifecycle below instead of the triage role strings.

- **Map**: `.scratch/<effort>/map.md`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records `research`, `prototype`, `grilling`, or `task`. An absent `Status:` means open; `Status:` records `claimed` or `resolved` once work starts.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan the effort's issues for open, unblocked, unclaimed files; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far.
