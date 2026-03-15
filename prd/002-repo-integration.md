# PRD 002: Repo Integration - Manifests, Hooks & GitHub Webhooks

## Summary

The glue between individual repos and the DevTrack API. Covers the project manifest file spec, Claude Code hooks that push state changes automatically, and GitHub webhook handling for PR lifecycle events.

## Problem

The API from PRD 001 is only useful if it has accurate, current data. Manually updating project state defeats the purpose. The system needs to observe work as it happens and update itself. Three integration points make this work: a manifest that declares what a repo is, hooks that fire on local dev activity, and webhooks that catch remote events.

## Project Manifest

A `project.yaml` file at the repo root. Committed to the repo. This is how a project registers itself with DevTrack and declares its workflow shape.

### SDLC Manifest

```yaml
name: "picking-app"
workflow: sdlc
domain: arcanelayer
owner: josh
tags: ["internal-tool", "operations"]

main_branch: main
branch_prefix: "feat/"
prd_path: "briefings/"
test_pattern: "**/*.test.ts"

deploy:
  environment: production
  url: "https://picking.arcanelayer.com"
  health_check: "/api/health"
```

### Content Manifest

```yaml
name: "joshowens-dev"
workflow: content
domain: joshowensdev
owner: josh
tags: ["blog", "personal-brand"]

main_branch: main
content_path: "src/content/"
draft_path: "src/content/drafts/"
```

### Required Fields

- `name` — unique project identifier, used everywhere
- `workflow` — `sdlc` or `content`
- `domain` — grouping for filtering
- `owner` — who owns this project

### Optional Fields

- `tags` — array of strings for filtering/grouping
- `main_branch` — defaults to "main"
- `branch_prefix` — helps identify feature branches
- `prd_path` — where PRDs live (SDLC)
- `test_pattern` — glob for test files (SDLC)
- `content_path` — where published content lives (content)
- `draft_path` — where drafts live (content)
- `deploy` — environment, url, health_check

## Registration Flow

When a user wants to track a repo:

1. Create `project.yaml` at repo root with the manifest
2. Run `devtrack register` from the repo (CLI reads manifest, POSTs to API)
3. API creates the project, returns confirmation
4. Hooks get installed (see below)

`devtrack register` should also:
- Validate the manifest against the schema
- Check that the project name isn't already taken
- Auto-detect `repo_url` from git remote
- Offer to install hooks

Subsequent runs of `devtrack register` update the existing project if the manifest changed.

## Claude Code Hooks

Claude Code supports hooks that fire on specific events. These are configured in `.claude/settings.json` per repo. Hooks call the DevTrack API to record activity.

### Hook Events to Capture

**Post-commit hook:**
- Fires after each commit
- Sends: project name, branch, commit hash, commit message, timestamp
- API records a `commit` event and updates `last_activity_at`

**Post-push hook:**
- Fires after pushing to remote
- Sends: project name, branch, commit count
- API records a `push` event

**Pre-session hook (on Claude Code start):**
- Fires when a Claude Code session opens in the repo
- Sends: project name, timestamp
- API updates `last_activity_at`, good for "active now" pulse on dashboard

**Post-session hook (on Claude Code exit):**
- Fires when Claude Code session ends
- Sends: project name, session duration
- API records session end

### Hook Implementation

Hooks are shell scripts that call the DevTrack CLI (which hits the API). Installed by `devtrack register` or `devtrack hooks install`.

Example post-commit hook (`.claude/hooks/post-commit.sh`):

```bash
#!/bin/bash
devtrack event commit \
  --branch "$(git branch --show-current)" \
  --hash "$(git rev-parse HEAD)" \
  --message "$(git log -1 --pretty=%s)"
```

The CLI handles reading `project.yaml` for the project name and auth.

### Hook Configuration

Hooks need the DevTrack API URL and API key. These come from environment:

```bash
DEVTRACK_API_URL=https://devtrack.owenslabs.com/api/v1
DEVTRACK_API_KEY=dt_xxxxxxxxxxxx
```

Or from a global config file at `~/.devtrack/config.yaml`:

```yaml
api_url: https://devtrack.owenslabs.com/api/v1
api_key: dt_xxxxxxxxxxxx
```

## GitHub Webhooks

GitHub sends webhook events to the DevTrack API for PR lifecycle tracking. This is the primary source of truth for PR state since it catches events that happen outside local dev (reviews, CI checks, merges via GitHub UI).

### Webhook Endpoint

`POST /api/v1/webhooks/github`

Secured with GitHub webhook secret (HMAC signature verification).

### Events to Handle

**pull_request (opened, closed, reopened, merged, edited):**
- Create or update PullRequest record
- Link to project via repo URL matching
- Link to branch if branch exists
- Record timeline event (pr_opened, pr_merged, pr_closed)

**pull_request_review (submitted):**
- Update PR status (reviewed, changes_requested, approved)
- Record timeline event (pr_reviewed)

**check_suite (completed):**
- Update PR check_status (passing, failing)

**push:**
- Could record commit events as backup to local hooks
- Update branch tracking

### Project Matching

Webhooks identify the project by matching the repo URL from the webhook payload against registered projects' `repo_url`. If no match, the webhook is ignored (not every repo needs to be tracked).

### Webhook Setup

Two options:
1. **Per-repo webhooks** — configured manually or via `devtrack register --setup-webhook` (uses GitHub API)
2. **GitHub App / Org webhook** — single webhook for all repos in the org, DevTrack filters by registered projects

Start with per-repo. Org-level is a future optimization.

## PRD Sync

When hooks detect changes to files in the `prd_path`, the system should sync PRD state:

1. Hook detects a commit touching files in `prd_path`
2. CLI reads the PRD files, parses frontmatter (title, summary, status)
3. CLI sends parsed PRD data to the API
4. API creates/updates PRD records and work items

This means PRD files need predictable frontmatter:

```yaml
---
title: "Barcode Scanning Support"
summary: "Adding barcode scanning and batch pick workflow to reduce picking errors"
status: in-progress
---
```

Work items can be parsed from markdown checklists in the PRD body:

```markdown
- [x] Define barcode data format
- [x] Scanner hardware integration
- [ ] Batch pick mode UI
- [ ] Pick verification flow
- [ ] Error handling and retry
```

## Content Sync

Same pattern for content workflow repos:

1. Hook detects changes in `content_path` or `draft_path`
2. CLI reads frontmatter from changed files
3. API creates/updates ContentItem records

Draft frontmatter:

```yaml
---
title: "How I Use Claude Code to Run 16 Projects"
summary: "Walkthrough of my multi-repo workflow and the tooling I built to stay sane"
status: draft
tags: ["claude-code", "workflow"]
---
```

Published content gets detected by files appearing in `content_path` (or status changing to published in frontmatter).

## Error Handling

- Hooks must fail silently. Never block a commit or push because the API is down.
- Hooks should log failures to `~/.devtrack/hook-errors.log`
- Webhooks return 200 even if processing fails (queue for retry internally)
- API-down state should be recoverable: next successful hook call syncs current state

## Non-Goals (this PRD)

- AIteam plugin integration (future: AIteam mission state as events)
- Automated branch → PRD linking via naming convention (future)
- Deploy detection / health monitoring (future)
