# PRD 001: Core API & Data Model

## Summary

Build the DevTrack API server with PostgreSQL-backed data model, RESTful endpoints, and OpenAPI spec. This is the foundation that the dashboard, CLI, hooks, and webhooks all build on.

## Problem

Tracking work across 16+ repos means holding project state in your head and flipping through terminal tabs. There's no single source of truth for "where is each project right now" or "what needs my attention." Git and GitHub have the raw signals but nothing aggregates them into a usable view.

## Solution

A REST API that stores and serves project state across all registered repos. Every other component (dashboard, CLI, hooks, webhooks) talks to this API. The OpenAPI spec is the contract that drives CLI generation via swagger-jack.

## Data Model

### Projects

The core entity. One per tracked repo.

```
Project
├── id (uuid)
├── name (string, unique) — e.g. "picking-app"
├── workflow (enum: sdlc, content)
├── domain (string) — e.g. "arcanelayer", "aiteam"
├── owner (string)
├── tags (string[])
├── repo_url (string) — GitHub remote URL
├── main_branch (string, default: "main")
├── branch_prefix (string, nullable) — e.g. "feat/"
├── prd_path (string, nullable) — e.g. "briefings/"
├── test_pattern (string, nullable) — e.g. "**/*.test.ts"
├── content_path (string, nullable) — for content workflows
├── draft_path (string, nullable) — for content workflows
├── deploy_environment (string, nullable)
├── deploy_url (string, nullable)
├── deploy_health_check (string, nullable)
├── last_activity_at (timestamp)
├── created_at (timestamp)
├── updated_at (timestamp)
```

### PRDs (Features / Work Units)

Tracked features for SDLC projects. Parsed from PRD files in the repo.

```
PRD
├── id (uuid)
├── project_id (fk → Project)
├── title (string)
├── summary (string) — one-liner describing the work
├── status (enum: queued, in_progress, completed)
├── source_path (string) — file path in repo, e.g. "briefings/barcode-scanning.md"
├── created_at (timestamp)
├── updated_at (timestamp)
```

### Work Items

Individual tasks within a PRD. Parsed from PRD files.

```
WorkItem
├── id (uuid)
├── prd_id (fk → PRD)
├── title (string)
├── status (enum: todo, in_progress, done)
├── order (int)
├── created_at (timestamp)
├── updated_at (timestamp)
```

### Content Items

For content workflow repos. Covers the full idea → draft → published pipeline.

```
ContentItem
├── id (uuid)
├── project_id (fk → Project)
├── title (string)
├── summary (string)
├── status (enum: idea, draft, published)
├── source_path (string, nullable) — null for ideas (API-only), set for drafts/published
├── tags (string[])
├── published_at (timestamp, nullable)
├── created_at (timestamp)
├── updated_at (timestamp)
```

### Branches

Active branches tracked per project.

```
Branch
├── id (uuid)
├── project_id (fk → Project)
├── prd_id (fk → PRD, nullable)
├── name (string)
├── is_active (boolean)
├── created_at (timestamp)
├── updated_at (timestamp)
```

### Pull Requests

PR state synced from GitHub.

```
PullRequest
├── id (uuid)
├── project_id (fk → Project)
├── branch_id (fk → Branch, nullable)
├── prd_id (fk → PRD, nullable)
├── github_id (int)
├── number (int)
├── title (string)
├── status (enum: draft, open, reviewed, changes_requested, approved, merged, closed)
├── url (string)
├── author (string)
├── check_status (enum: pending, passing, failing, nullable)
├── opened_at (timestamp)
├── merged_at (timestamp, nullable)
├── created_at (timestamp)
├── updated_at (timestamp)
```

### Events

The activity timeline. Every meaningful action across all projects gets logged here.

```
Event
├── id (uuid)
├── project_id (fk → Project)
├── prd_id (fk → PRD, nullable)
├── pull_request_id (fk → PullRequest, nullable)
├── type (enum: commit, branch_created, branch_deleted, pr_opened, pr_reviewed,
│         pr_merged, pr_closed, prd_created, prd_updated, prd_completed,
│         deploy, content_idea_added, content_draft_started, content_published)
├── title (string) — human-readable one-liner
├── metadata (jsonb) — flexible payload per event type
├── occurred_at (timestamp)
├── created_at (timestamp)
```

## API Endpoints

All endpoints prefixed with `/api/v1`. Responses use standard envelope:

```json
{
  "data": { ... },
  "meta": { "total": 42, "page": 1, "per_page": 20 }
}
```

### Projects

| Method | Path | Description |
|--------|------|-------------|
| GET | /projects | List all projects (filterable by domain, workflow, tags) |
| POST | /projects | Register a new project |
| GET | /projects/:id | Get project detail with current state summary |
| PATCH | /projects/:id | Update project |
| DELETE | /projects/:id | Unregister a project |
| GET | /projects/:id/status | Computed status: active PRD progress, open PRs, last activity, health signals |

### PRDs

| Method | Path | Description |
|--------|------|-------------|
| GET | /projects/:id/prds | List PRDs for a project |
| POST | /projects/:id/prds | Create/sync a PRD |
| GET | /prds/:id | Get PRD with work items |
| PATCH | /prds/:id | Update PRD status/summary |
| GET | /prds/:id/work-items | List work items |
| POST | /prds/:id/work-items | Create/sync work items |
| PATCH | /work-items/:id | Update work item status |

### Content Items

| Method | Path | Description |
|--------|------|-------------|
| GET | /projects/:id/content | List content items (filterable by status) |
| POST | /projects/:id/content | Add idea or sync draft |
| GET | /content/:id | Get content item |
| PATCH | /content/:id | Update status/summary (promote idea → draft, etc.) |
| DELETE | /content/:id | Remove content item |

### Pull Requests

| Method | Path | Description |
|--------|------|-------------|
| GET | /prs | List all open PRs across projects (the PR queue) |
| GET | /projects/:id/prs | List PRs for a project |
| POST | /projects/:id/prs | Sync PR from GitHub webhook |
| PATCH | /prs/:id | Update PR status |

### Branches

| Method | Path | Description |
|--------|------|-------------|
| GET | /projects/:id/branches | List branches for a project |
| POST | /projects/:id/branches | Register a branch |
| PATCH | /branches/:id | Update branch (link to PRD, mark inactive) |

### Events / Timeline

| Method | Path | Description |
|--------|------|-------------|
| GET | /events | Cross-project timeline (filterable by project, domain, type, date range) |
| GET | /projects/:id/events | Events for a single project |
| POST | /events | Record an event (used by hooks and webhooks) |
| GET | /events/summary | Daily rollup: "5 commits across 3 projects, 1 PR merged" |

### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| POST | /webhooks/github | GitHub webhook receiver (PR events, push events) |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | API health check |

## OpenAPI Spec

The API must produce a complete OpenAPI 3.1 spec at `/api/v1/openapi.json`. This spec is the contract that swagger-jack uses to generate the CLI. Every endpoint, request body, response schema, and enum must be fully documented in the spec.

## Auth

API key auth via `Authorization: Bearer <key>` header. Single-user for now, but the key mechanism supports multi-tenant later when client projects show up. API key stored as env var, validated in middleware.

## Validation

All request bodies validated with Zod schemas. Zod schemas are the source of truth; Prisma models match them. Validation errors return 422 with field-level error details.

## Non-Goals (this PRD)

- Dashboard UI (PRD 003)
- CLI tool (PRD 004)
- Hook and webhook implementation details (PRD 002)
- Multi-user / team features
- Notifications or alerting
