# PRD 007: Cleanup & Gap Closure (PRDs 001–004)

## Summary

Close remaining gaps from the first four PRDs before moving to new features. This covers wiring the dashboard home page to the real API, finishing incomplete CLI commands, and fixing the Docker/deployment setup. Each item is small individually — the goal is to get PRDs 001–004 to 100% before starting PRD 005 or 006.

## Problem

After the initial implementation push, an audit revealed several gaps:

- The main dashboard page (the first thing you see) still renders hardcoded mock data instead of querying the API
- The CLI has commands that are partially implemented or missing subcommands
- The API is missing a few filter options and formatting that the original PRDs specified
- The Docker setup needs fixes for local development with Traefik
- Several small inconsistencies between what the PRDs specified and what was built

None of these are individually large, but together they prevent the system from being usable end-to-end.

## Scope

This PRD covers gaps from PRDs 001–004 only. PRD 005 (Unified Document Model) and PRD 006 (Agent Remote Control) are explicitly out of scope. Content workflow features are not being pursued — SDLC is the only supported workflow.

---

## 1. Dashboard Home Page — Wire to Real API

**Source:** PRD 003

The dashboard home page (`components/features/dashboard/dashboard-page.tsx`) imports `PROJECTS` from `lib/mock-data.ts`. Every other page (PR queue, project detail, timeline, sidebar) was wired to SWR hooks in the last pull. The home page was missed.

**Work:**
- Replace `import { PROJECTS, ... } from "@/lib/mock-data"` with `useProjects()` from `lib/hooks.ts`
- Map API responses through `mapProject()` from `lib/mappers.ts`
- Add `ProjectCardSkeleton` loading state (already exists in `loading-states.tsx`)
- Add `ErrorState` with retry for API failures
- Add `EmptyState` for when no projects exist
- Remove `lib/mock-data.ts` entirely once no imports remain

**Acceptance criteria:**
- [ ] Dashboard home fetches projects from `GET /api/v1/projects`
- [ ] Shows skeleton grid while loading
- [ ] Shows error state with retry on API failure
- [ ] Shows empty state when no projects exist
- [ ] Filters, sort, and search work against live data
- [ ] `lib/mock-data.ts` has no remaining imports anywhere in the codebase

---

## 2. Events Filterable by Domain

**Source:** PRD 001

The `GET /api/v1/events` endpoint accepts `project_id`, `type`, `from`, and `to` filters. PRD 001 specifies events should also be filterable by `domain`. Domain is a project-level attribute, so this requires a join.

**Work:**
- Add `domain` query parameter to `GET /api/v1/events`
- Filter events by joining through the Project table where `project.domain = :domain`
- Update the OpenAPI spec
- Add domain filter chip to the timeline page (it already filters by project and event type)

**Acceptance criteria:**
- [ ] `GET /api/v1/events?domain=arcanelayer` returns only events from projects in that domain
- [ ] Timeline page has domain filter chips matching the dashboard's domain filter UX
- [ ] OpenAPI spec documents the `domain` parameter

---

## 3. Events Summary — Human-Readable Format

**Source:** PRD 001

`GET /api/v1/events/summary` returns raw counts grouped by project and event type. PRD 001 specifies a human-readable daily rollup like: "5 commits across 3 projects, 1 PR merged."

**Work:**
- Add a `summary` string field to the events summary response that aggregates counts into a human-readable sentence
- Keep the existing raw counts for programmatic use
- Update timeline day headers to display this summary string

**Acceptance criteria:**
- [ ] Events summary response includes a `summary` string per day
- [ ] Timeline day group headers show the human-readable summary
- [ ] Format: "{N} commits across {M} projects, {N} PRs merged, {N} PRDs completed" (omit zero-count items)

---

## 4. CLI: `register` Improvements

**Source:** PRD 002, PRD 004

The `devtrack register` command reads `project.yaml` and creates/updates the project via API, but is missing two behaviors from the PRDs.

**Work:**
- Auto-detect `repo_url` from `git remote get-url origin` when not specified in manifest
- After successful registration, prompt to install hooks (`Would you like to install hooks? [Y/n]`)
- Skip the prompt in `--quiet` mode

**Acceptance criteria:**
- [ ] If `repo_url` is empty in `project.yaml`, `register` fills it from `git remote get-url origin`
- [ ] After creating a new project, `register` offers to run `hooks install`
- [ ] `--quiet` mode skips the prompt and does not install hooks

---

## 5. CLI: `sync` — Full Sync

**Source:** PRD 002, PRD 004

The `sync` command currently only syncs pull requests. PRD 002 specifies it should be a full re-sync: re-read `project.yaml`, scan `prd_path` for PRDs, and fetch open PRs from GitHub.

**Work:**
- Re-read and update project from `project.yaml` (same as `register --update`)
- Scan `prd_path` directory, parse each file, create/update PRDs and work items via API
- Keep existing PR sync behavior
- Report a summary of what was synced

**Acceptance criteria:**
- [ ] `devtrack sync` updates the project from manifest
- [ ] Scans and syncs PRD files from `prd_path`
- [ ] Syncs open PRs from GitHub
- [ ] Prints a summary: "Synced: 3 PRDs, 2 PRs"
- [ ] `--quiet` mode prints only the summary line

---

## 6. CLI: `hooks test`

**Source:** PRD 004

Verify hooks are installed and the API is reachable. Check that `.git/hooks/post-commit` exists (or Claude Code hooks in settings.json), then make a test API call.

**Acceptance criteria:**
- [ ] `devtrack hooks test` checks hook files exist and API responds to health check
- [ ] Reports which hooks are installed and which are missing
- [ ] Exits non-zero if no hooks are installed or API is unreachable

---

## 7. Docker & Local Dev Setup

**Source:** Deployment work

The Dockerfile and docker-compose need updates for local development with the existing Traefik instance.

**Work:**

**Dockerfile:**
- Switch `reactive-swr` from GitHub source to npm (`^0.2.0`) — the GitHub install lacks a `dist/` directory and breaks in Docker
- Remove the reactive-swr export patching hack

**docker-compose.yml:**
- Remove direct port mapping on the app service (Traefik handles routing)
- Connect app to the external `traefik_default` network
- Add Traefik labels for `devtrack.magi.theowens.casa` routing
- Add `traefik.docker.network=traefik_default` label
- Exclude `/app/lib/generated` from bind mount (Prisma client generation)

**Security headers (`lib/security-headers.ts`):**
- In development mode, add `'unsafe-inline'` to `script-src` (Next.js dev server injects inline scripts)
- In development mode, add `ws: wss:` to `connect-src` (HMR websocket connections)

**Providers (`app/providers.tsx`):**
- Add fallback for `crypto.randomUUID()` — not available over plain HTTP in non-localhost contexts

**Acceptance criteria:**
- [ ] `docker compose up --build` starts successfully with no manual steps
- [ ] App accessible at `http://devtrack.magi.theowens.casa` via Traefik
- [ ] No CSP errors in browser console
- [ ] No `crypto.randomUUID` errors
- [ ] `GET /api/health` returns healthy
- [ ] Hot reload works (edit a component, see change in browser)

---

## 8. Remove Dead Mock Data

**Source:** Cleanup

Once the dashboard home page is wired to the API (item 1), `lib/mock-data.ts` should have no remaining imports. Remove it and any associated test fixtures that reference it.

**Work:**
- Delete `lib/mock-data.ts`
- Remove any imports of mock data types — use API response types mapped through `lib/mappers.ts`
- Update any tests that imported mock data to use proper fixtures

**Acceptance criteria:**
- [ ] `lib/mock-data.ts` does not exist
- [ ] `grep -r "mock-data" --include="*.ts" --include="*.tsx"` returns zero results (excluding test fixtures if they define their own)
- [ ] All tests pass
- [ ] `pnpm typecheck` passes

---

## 9. Strip Content Workflow

**Source:** Simplification

The codebase has a content workflow (ideas → drafts → published) that we're not pursuing. SDLC is the only workflow. Content artifacts are spread across the data model, API, CLI, dashboard, sync logic, and tests. Removing them simplifies the system and reduces surface area for bugs.

**What to remove:**

**Prisma schema:**
- `ContentItem` model
- `ContentItemStatus` enum
- `content_path`, `draft_path` fields on `Project`
- `content_published`, `content_updated` from `EventType` enum
- `Workflow` enum (all projects are SDLC — drop the enum, remove the `workflow` field from `Project`)
- Run migration

**API routes:**
- `app/api/v1/content/[id]/route.ts` — delete
- `app/api/v1/projects/[id]/content/route.ts` — delete
- Remove content schemas from `lib/schemas/index.ts`
- Remove content endpoints from `app/api/v1/openapi.json/route.ts` and `specs/openapi.yaml`
- Remove `content_path`, `draft_path`, `workflow` from project create/update schemas

**Lib:**
- `lib/content-parser.ts` — delete
- `lib/content-sync.ts` — delete
- `types/content-parser.ts` — delete
- `types/content-sync.ts` — delete
- `types/content.ts` — delete
- Remove content-related mappers from `lib/mappers.ts` (`buildContentSummaryLine`, content status mapping)
- Remove `content_path`, `draft_path` from `lib/manifest.ts` and `types/manifest.ts`
- Remove content workflow branches from `lib/mock-data.ts` (if it still exists at this point)

**Tests:**
- `lib/__tests__/content-parser.test.ts` — delete
- `lib/__tests__/content-sync.test.ts` — delete
- Update `lib/__tests__/mappers.test.ts` — remove content mapper tests
- Update `lib/__tests__/manifest.test.ts` — remove content_path/draft_path tests
- Update `__tests__/prisma-schema.test.ts` — remove ContentItem assertions
- Update `__tests__/schemas.test.ts` — remove content schema tests
- Update `app/projects/__tests__/project-page.test.tsx` — remove content workflow test cases
- Update `app/timeline/__tests__/timeline-page.test.tsx` — remove content event test cases

**CLI (Go):**
- `cli/cmd/ideas.go` — delete
- `cli/cmd/ideas_test.go` — delete
- `cli/cmd/projects_createContent.go` — delete
- `cli/cmd/projects_listContent.go` — delete
- `cli/cmd/content_getContent.go` — delete
- `cli/cmd/content_updateContent.go` — delete
- `cli/cmd/content_deleteContent.go` — delete
- `cli/cmd/content.go` — delete
- Remove `content_path`, `draft_path` from `cli/internal/manifest.go` and its tests
- Remove content fields from `cli/cmd/register.go` and `cli/cmd/projects_createProject.go`

**Dashboard:**
- Remove content workflow conditional rendering from `app/projects/[slug]/ProjectPageClient.tsx` (the "Ideas/Drafts/Published" pipeline section)
- Remove workflow filter chips from dashboard (no need to filter by sdlc/content if everything is sdlc)
- Remove `WorkflowBadge` component usage (or the component itself if unused)

**Acceptance criteria:**
- [ ] `ContentItem` model does not exist in Prisma schema
- [ ] `Workflow` enum does not exist in Prisma schema
- [ ] No `content` API routes exist
- [ ] `grep -r "ContentItem\|content_path\|draft_path\|content_sync\|content_parser\|ideas" --include="*.ts" --include="*.tsx" --include="*.go"` returns zero results (excluding this PRD and changelog)
- [ ] CLI has no `ideas` or `content` commands
- [ ] Dashboard shows no workflow type badges or content pipeline sections
- [ ] All tests pass
- [ ] `pnpm typecheck` passes
- [ ] CLI compiles (`cd cli && go build`)

---

## Non-Goals

- PRD 005 (Unified Document Model) — separate PRD, requires schema migration
- PRD 006 (Agent Remote Control) — separate PRD, new feature
- Content workflow features — SDLC is the only supported workflow
- Production Kubernetes deployment — tracked in `docs/DEPLOYMENT.md`
- CI/CD pipeline for container image builds
- Light theme / theme toggle
