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

- A new `tool_use` event type, accepted end-to-end (API, database, CLI), so Claude Code tool activity is recorded as what it is — not disguised as commits.
- The Claude Code PostToolUse hook forwards the full Bash command it observed (available on hook stdin as `tool_input.command`), plus session id and working directory, as a `tool_use` event.
- Git hooks that actually work: a real `git commit` records a `commit` event carrying the real commit message; `git push` records a `push` event. Every type any installed hook emits must be one the API accepts.
- Client-side secret redaction of forwarded command text before it leaves the machine.
- Hook installer regenerates/upgrades previously installed hooks in place, so existing tracked repos pick up the fix by re-running install.
- Zero-setup project identity: the manifest becomes optional. Project identity resolves through a chain (manifest → git remote URL → normalized folder name), the server finds-or-creates projects on incoming events instead of rejecting unknown ones, and the manifest is renamed `devtrack.yaml` (with legacy `project.yaml` still read for existing repos).
- Silent manifest bootstrap: the first time the CLI sends an event from a repo with no manifest, it writes a minimal `devtrack.yaml` (derived name + repo URL) to pin the project's identity at first contact.

### Out of Scope

- Server-side dedup, rollups, or derivation of higher-level events from raw ones (deliberately deferred — collect first, interpret later).
- Widening the PostToolUse matcher beyond Bash (Edit/Write/etc. telemetry can follow once we see what's useful).
- Dashboard changes to visualize the new event type (free-form rendering of the event feed is acceptable for now).
- Backfilling or cleaning the existing phantom `commit` rows (there are only a handful; they can be deleted by hand or ignored).

## Requirements

### Functional Requirements

1. The system shall accept and store a `tool_use` event type through the public events API.
2. A Bash tool invocation in a Claude Code session within a tracked repo shall be recorded as exactly one `tool_use` event — never as a `commit`.
3. A `tool_use` event shall carry the full command text as its title and the Claude session id and working directory as metadata.
4. A real `git commit` in a tracked repo shall be recorded as exactly one `commit` event whose title is the commit's subject line, with the commit hash in metadata.
5. A `git push` from a tracked repo shall be recorded as a `push` event with the branch name in metadata.
6. Every event type emitted by any hook the installer writes shall be a type the events API accepts; the installer shall not emit `post-commit`, `pre-push`, `post-merge`, or `post-checkout` as event types.
7. All hooks (git and Claude) shall resolve the target project through a shared identity chain: `devtrack.yaml` at the repo root if present (falling back to reading legacy `project.yaml`), else the git remote URL, else the repo folder name normalized to lowercase. A missing manifest shall never cause an event to be dropped.
8. The events API shall find-or-create the project for an incoming event using the supplied identity (name and/or repo URL) rather than rejecting events for unregistered projects.
9. When the CLI sends an event from a repo with no manifest, it shall write a minimal `devtrack.yaml` (derived project name and repo URL) to the repo root, exactly once, without prompting; a failure to write shall not block the event.
10. Command text shall be redacted client-side before transmission when it matches secret-shaped patterns (assignments or headers containing token, secret, password, key, authorization, and similar); redaction shall replace only the matched value, preserving the rest of the command.
11. All hooks shall remain non-blocking: a hook failure shall never break a git operation or a Claude session.
12. Re-running the hook installer in an already-configured repo shall upgrade the managed hook blocks in place without duplicating them.

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

## Risks & Open Questions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Secrets slip past redaction patterns into cloud Postgres | Medium | Credential exposure in DB rows | Conservative patterns, cap + review stored commands early, DB already gated by CF Access + API key |
| `tool_use` volume grows large | Medium | Table bloat, slow feed queries | Acceptable at current scale; revisit with retention/rollup policy later |
| Stale hook copies keep firing old commands (e.g. the hand-copied hooks in `~/.claude/settings.json`) | High | Phantom commits continue on machines with stale config | Document the refresh step; installer upgrade path covers git hooks |
| Auto-registration pollutes the dashboard with third-party clones and scratch repos | Medium | Noisy project list | Accepted under overcollection; projects are cheap to archive/delete server-side |
| Manifest bootstrap drops untracked `devtrack.yaml` files into repos the user doesn't own | Medium | Confusing git status, accidental PR inclusion | Well-commented file content; consider an opt-out (see open questions) |

### Open Questions

- [ ] Should `post-checkout`/`post-merge` git hooks map to new event types (e.g. branch activity) or be dropped from the installer until a use case appears?
- [ ] What is the canonical redaction pattern list, and where does it live so both hooks and future collectors share it?
- [ ] Does the deployed server need any change beyond the schema/spec update, or does the existing events endpoint accept the new type transparently once the enum grows?
- [ ] Should manifest bootstrap have an env kill-switch (e.g. `DEVTRACK_NO_BOOTSTRAP=1`) for third-party clones, or is a normalized derived-name-only mode enough?
- [ ] Should existing repos' `project.yaml` files be migrated (renamed) by the installer, or is read-fallback support permanent?
