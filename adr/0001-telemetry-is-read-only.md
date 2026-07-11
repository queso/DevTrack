# ADR 0001: Telemetry commands never write files

**Status:** Accepted
**Date:** 2026-07-11
**Deciders:** Josh (issue #16, from conduit PR #57 smoke testing)

## Context

The fix-event-collection mission (PR #13) shipped a silent manifest bootstrap:
the first `devtrack event` from a repo with no `devtrack.yaml` wrote one as a
side effect, pinning project identity at first contact (PRD FR-10, with
`DEVTRACK_NO_BOOTSTRAP=1` as opt-out). The PRD's risk table anticipated only
"confusing git status." Reality was worse: a conduit harness child running
under kernel containment inherited the user-level Claude hooks, the
session-start event silently wrote `devtrack.yaml` into the confined project
root, and conduit's owned-paths integrity gate correctly halted the run —
every first attempt in an unregistered directory burned itself (~2× token
cost).

## Decision

Telemetry is read-only. `devtrack event` (and every hook that routes through
`sendEvent`) performs zero filesystem writes; identity resolves through the
read-only chain (devtrack.yaml → git remote URL → folder name). Manifest
creation is an explicit provisioning act: `devtrack init`, which fails loudly
when the write fails. `DEVTRACK_NO_BOOTSTRAP` is removed — there is no silent
write to opt out of.

## Alternatives considered

- **Keep silent bootstrap, guard the hooks on manifest presence** (the magi
  workaround): also stops event collection from unregistered repos entirely,
  reversing the PRD's overcollection philosophy. Rejected — the file write was
  the problem, not the event.
- **Keep silent bootstrap with the env-var opt-out**: every confined
  environment has to rediscover the failure and the escape hatch. Rejected.

## Why it matters later

Any future command that is conceptually "report what happened" must not
create, modify, or delete files as a side effect — logging and provisioning
stay separate verbs. A DevTrack client must be safe to run inside other
systems' sandboxes (CI, kernel-contained harnesses, read-only checkouts) by
default. Don't re-litigate silent bootstrap; extend `devtrack init` if
provisioning needs grow.
