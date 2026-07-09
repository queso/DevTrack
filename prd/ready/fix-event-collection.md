---
missionId: ~
---

# Fix Event Collection: Real Commits In, Phantom Commits Out

**Author:** Josh Owens  **Date:** 2026-07-09  **Status:** Draft

## Problem Statement

DevTrack's event stream is inverted: it records noise and drops signal. Every Bash tool call in a Claude Code session is recorded as a `commit` event (the PostToolUse hook fires `devtrack event --type commit` unconditionally, with no git awareness), while real git commits are never recorded at all — the git hook installer writes event types the API rejects (`post-commit`, `pre-push`, `post-merge`, `post-checkout`), so every git hook errors and is silently swallowed. Verified in production on 2026-07-09: three phantom "commits" from three shell commands in one session, zero events from actual commits.

The guiding philosophy for the fix, per Josh: **thin dumb client, overcollect raw events into Postgres now, derive meaning server-side later.** We are still discovering which signals are useful, so the client should forward what happened verbatim rather than interpret it.

## Scope

### In Scope

- New event types accepted end-to-end (API, database, CLI): `tool_use` for Claude Code tool activity, and `checkout` and `merge` so all four installed git hooks map to valid types.
- The Claude Code PostToolUse hook forwards the full Bash command it observed (available on hook stdin as `tool_input.command`), plus session id and working directory, as a `tool_use` event.
- Git hooks that actually work: a real `git commit` records a `commit` event carrying the real commit message; `git push` records a `push` event; branch checkouts and merges record `checkout`/`merge` events with branch names in metadata.
- Client-side secret redaction of forwarded command text before it leaves the machine, with the pattern list compiled into the Go CLI as the single enforcement point.
- Hook installer regenerates/upgrades previously installed hooks in place, so existing tracked repos pick up the fix by re-running install.
- Zero-setup project identity: the manifest becomes optional. Project identity resolves through a chain (manifest → git remote URL → normalized folder name), the server finds-or-creates projects on incoming events instead of rejecting unknown ones, and the manifest is named `devtrack.yaml`. Hard cutover from `project.yaml`: no read-fallback in code; the handful of existing manifests are renamed by hand in one sweep (tracked as a rollout step).
- Silent manifest bootstrap: the first time the CLI sends an event from a repo with no manifest, it writes a minimal `devtrack.yaml` (derived name + repo URL) to pin the project's identity at first contact. Setting `DEVTRACK_NO_BOOTSTRAP=1` skips the file write (events still send via the identity chain).

### Out of Scope

- Server-side dedup, rollups, or derivation of higher-level events from raw ones (deliberately deferred — collect first, interpret later).
- Widening the PostToolUse matcher beyond Bash (Edit/Write/etc. telemetry can follow once we see what's useful).
- Dashboard changes to visualize the new event type (free-form rendering of the event feed is acceptable for now).
- Backfilling or cleaning the existing phantom `commit` rows (there are only a handful; they can be deleted by hand or ignored).

## Requirements

### Functional Requirements

1. The system shall accept and store `tool_use`, `checkout`, and `merge` event types through the public events API.
2. A Bash tool invocation in a Claude Code session within a tracked repo shall be recorded as exactly one `tool_use` event — never as a `commit`.
3. A `tool_use` event shall carry the full command text as its title and the Claude session id and working directory as metadata.
4. A real `git commit` in a tracked repo shall be recorded as exactly one `commit` event whose title is the commit's subject line, with the commit hash in metadata.
5. A `git push` from a tracked repo shall be recorded as a `push` event with the branch name in metadata.
6. A branch checkout shall be recorded as a `checkout` event and a merge as a `merge` event, each carrying the relevant branch names in metadata.
7. Every event type emitted by any hook the installer writes shall be a type the events API accepts; the installer shall not emit `post-commit`, `pre-push`, `post-merge`, or `post-checkout` as event types.
8. All hooks (git and Claude) shall resolve the target project through a shared identity chain: `devtrack.yaml` at the repo root if present, else the git remote URL, else the repo folder name normalized to lowercase. `project.yaml` shall not be read. A missing manifest shall never cause an event to be dropped.
9. The events API shall find-or-create the project for an incoming event using the supplied identity, matching on repo URL before name so a derived-name mismatch cannot fork an existing project's history.
10. When the CLI sends an event from a repo with no manifest, it shall write a minimal `devtrack.yaml` (derived project name and repo URL) to the repo root, exactly once, without prompting; a failure to write shall not block the event. Setting `DEVTRACK_NO_BOOTSTRAP=1` shall skip the write entirely.
11. Command text shall be redacted client-side before transmission when it matches secret-shaped patterns (assignments or headers containing token, secret, password, key, authorization, and similar); redaction shall replace only the matched value, preserving the rest of the command. The pattern list shall be compiled into the Go CLI so every event passes through one enforcement point.
12. All hooks shall remain non-blocking: a hook failure shall never break a git operation or a Claude session.
13. Re-running the hook installer in an already-configured repo shall upgrade the managed hook blocks in place without duplicating them.

### Non-Functional Requirements

1. The client shall not filter, dedupe, or interpret events beyond secret redaction — raw collection is the contract.
2. Command text shall be capped at a sane maximum length (with an explicit truncation marker) so pathological commands cannot bloat rows or requests.
3. The CLI surface for the new type shall be generated through the existing OpenAPI → swagger-jack pipeline, not hand-edited, so the spec remains the source of truth.

### Edge Cases & Error States

- Commands containing quotes, newlines, or shell metacharacters must survive the hook → CLI → API path intact (no shell re-interpretation of forwarded text).
- `git commit --amend` and rebases fire post-commit repeatedly; each firing records an event (acceptable under overcollection).
- A repo with no git remote (local-only): identity falls through to the normalized folder name; no error, events still flow.
- Two different repos resolving to the same derived name (e.g. two local folders both named `api` with no remotes): acceptable collision under overcollection; the manifest exists precisely to disambiguate when it matters.
- A read-only repo checkout or a hook racing another process on manifest bootstrap: the write fails quietly and the event still sends; the next send retries the bootstrap.
- A repo whose folder was renamed after events were recorded under the derived name: the manifest written at first contact pins identity, so this only affects repos that never got a manifest (accepted).
- Redaction must not mangle commands that merely mention the trigger words in file paths or messages (e.g., `vim docs/api-keys.md` should pass through unredacted; `export API_KEY=abc123` should not).
- Hook stdin absent or malformed (hook run by hand, harness change): the hook shall fail quietly rather than send an empty or garbage event.

## Risks & Resolved Decisions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Secrets slip past redaction patterns into cloud Postgres | Medium | Credential exposure in DB rows | Conservative patterns, cap + review stored commands early, DB already gated by CF Access + API key |
| `tool_use` volume grows large | Medium | Table bloat, slow feed queries | Acceptable at current scale; revisit with retention/rollup policy later |
| Stale hook copies keep firing old commands (e.g. the hand-copied hooks in `~/.claude/settings.json`) | High | Phantom commits continue on machines with stale config | Document the refresh step; installer upgrade path covers git hooks |
| Auto-registration pollutes the dashboard with third-party clones and scratch repos | Medium | Noisy project list | Accepted under overcollection; projects are cheap to archive/delete server-side |
| Manifest bootstrap drops untracked `devtrack.yaml` files into repos the user doesn't own | Medium | Confusing git status, accidental PR inclusion | Well-commented file content; `DEVTRACK_NO_BOOTSTRAP=1` opt-out |
| A repo with a missed `project.yaml` (hard cutover) resolves identity via remote URL instead | Low | None if repo URL is registered — find-or-create matches on repo URL before name | Rollout step: rename all existing manifests in one sweep |

### Resolved Decisions (2026-07-09)

All open questions were resolved with Josh:

1. **Git checkout/merge hooks** → add `checkout` and `merge` event types while the enum is already open. Full overcollection; branch names in metadata.
2. **Redaction pattern list** → compiled into the Go CLI. Every event flows through the one binary, so it is a single enforcement point; user-editable extension can layer on later if ever needed.
3. **Server-side impact** (verified in code) → the type enum lives in three synced places: the Prisma `EventType` Postgres enum (requires a migration, auto-applied by the deployment's `migrate` initContainer on rollout), the zod schema in `web/lib/schemas/`, and the OpenAPI spec that drives CLI codegen. No API logic changes.
4. **Bootstrap escape hatch** → yes, `DEVTRACK_NO_BOOTSTRAP=1` skips the manifest write; events still send via the identity chain.
5. **project.yaml migration** → hard cutover. No read-fallback in code; the few existing `project.yaml` files are renamed by hand in one sweep as a rollout step. Safe because find-or-create matches on repo URL before name.

## Post-Mission Rollout Sweep

Manual steps once the mission ships (these are operations on other repos and machines, not code in this one — the mission cannot do them):

- [ ] Rename `project.yaml` → `devtrack.yaml` in every repo that has one (this repo, conduit, and any others wired on 2026-07-08 — check the repos behind the 15 registered projects).
- [ ] Replace the hand-copied hook commands in `~/.claude/settings.json` (global Claude settings) with the new hook definitions — they still fire `--type commit` on every Bash call until refreshed.
- [ ] Re-run `devtrack hooks install` in each repo with git hooks installed, so the managed blocks regenerate with valid event types.
- [ ] Cut a CLI release and confirm the plugin wrapper's `minCliVersion` forces the update on other machines.
- [ ] Delete the handful of phantom `commit` rows from production if they annoy the dashboard (optional).
