# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.0] - 2026-03-24

### Added

#### Dashboard API Integration
- Real-time project data wiring via useProjects() SWR hook replacing mock data (#WI-001)
- Loading skeleton state for dashboard component (#WI-001)
- Error state with retry capability for failed API calls (#WI-001)
- Empty state messaging when no projects available (#WI-001)

#### Events API Enhancements
- Domain filtering on GET /api/v1/events endpoint (#WI-002)
- Human-readable summaries for events summary endpoint via buildDaySummary helper (#WI-003)
- Timeline day headers displaying computed summaries (#WI-003)

#### CLI Enhancements
- CLI register auto-detects repo_url from git remote origin (#WI-004)
- Interactive prompt for hooks installation after project registration (#WI-004)
- CLI sync performs full re-sync with PRDs and pull requests (#WI-005)
- CLI hooks test subcommand verifying git hooks, Claude Code hooks, and API health (#WI-006)

#### Deployment
- Removed reactive-swr patching hack from Dockerfile, now using npm ^0.2.0 (#WI-007)

### Removed

#### Content Workflow
- Entire content workflow stripped from codebase following deprecation decision (#WI-008)
- Content endpoints removed: GET /api/v1/projects/{id}/content, POST, PATCH, DELETE (#WI-008)
- Content endpoint removed: GET /api/v1/content/{id} (#WI-008)
- ContentItem model removed from Prisma schema (#WI-008)
- Content-related CLI commands removed: devtrack ideas list/add, devtrack projects create-content (#WI-008)
- Content type definitions and parsers removed (#WI-008)
- Content sync and validation removed (#WI-008)
- Mock data removed: lib/mock-data.ts and all imports (#WI-009)

## [0.4.0] - 2026-03-18

### Added

#### CLI Tool - swagger-jack Generated Commands
- 34 auto-generated Cobra CLI commands from OpenAPI spec via swagger-jack (#PRD-004)
- Commands covering 10 API resources: projects, PRDs, work items, content, PRs, branches, events, webhooks, and more (#PRD-004)
- Automatic command generation with typed parameters and help text from API spec (#PRD-004)

#### Manifest Helpers
- ReadManifest function for parsing project.yaml files with Zod validation (#PRD-004)
- FindManifest function for recursive manifest discovery from current directory (#PRD-004)
- ResolveProjectID function for mapping local manifests to API project IDs (#PRD-004)
- URL normalization for GitHub repo matching (#PRD-004)

#### CLI Convenience Commands
- `devtrack register` — Register repository with DevTrack using local manifest (#PRD-004)
- `devtrack status` — Display project status (PRDs, PRs, recent events) (#PRD-004)
- `devtrack dashboard` — Cross-project overview with activity classification (#PRD-004)
- `devtrack event` — Record events with type validation and hyphen-to-underscore mapping (#PRD-004)
- `devtrack prs` — List open pull requests across projects with filtering (#PRD-004)
- `devtrack sync` — Trigger server-side pull request synchronization (#PRD-004)
- `devtrack ideas` — Manage content ideas (list/add) (#PRD-004)
- `devtrack hooks install` — Install git hooks calling devtrack event for activity tracking (#PRD-004)
- `devtrack hooks uninstall` — Clean removal of hooks preserving custom hook logic (#PRD-004)

#### OpenAPI Specification
- Formalized OpenAPI 3.1 spec at `specs/openapi.yaml` documenting all API endpoints (#PRD-004)
- Complete request/response schemas and validation rules (#PRD-004)

### Testing

- 19 manifest helper tests covering file reading, manifest discovery, and project ID resolution
- 63 total Go tests across CLI commands and internal packages
- All tests passing with standard Go testing tools

### Code Quality

- Full TypeScript integration with auto-generated Go code
- Zod validation for manifest parsing
- Comprehensive error handling with user-friendly messages
- Clean separation of auto-generated and hand-written commands

## [0.3.0] - 2026-03-17

### Added

#### Dashboard UI - SWR Integration
- Centralized SWR data fetching hooks for projects, PRDs, PRs, events, and branches (#WI-628)
- Consistent cache key generation across all data types (#WI-628)
- Stale-while-revalidate caching with configurable intervals (#WI-628)

#### Data Transformation Layer
- API-to-UI mapper functions converting flat Prisma models to rich UI types (#WI-630)
- Project enrichment with PR counts, domain grouping, and status computation (#WI-630)
- PR aging color coding (green <1 day, yellow 1-3 days, red >3 days) (#WI-630)

#### Loading & Error States
- Reusable loading state skeletons for dashboard, project, and timeline pages (#WI-629)
- Empty state components with contextual messaging (#WI-629)
- Error boundary handling with retry capabilities (#WI-629)

#### Dashboard Page
- Live-wired dashboard with real-time project cards (#WI-632)
- Project filtering by domain, workflow type, and custom search (#WI-632)
- Sorting by name, updated date, PR count, and activity (#WI-632)

#### Sidebar Navigation
- Projects organized by domain with collapsible grouping (#WI-631)
- Real-time PR count badge for each project (#WI-631)
- Current project highlighting with active state styling (#WI-631)

#### Project Summary Page
- Full project detail view with metadata and status (#WI-633)
- Timeline pagination showing recent project events (#WI-633)
- Links to PRDs, content, and pull requests (#WI-633)

#### PR Queue Page
- Unified list of all open pull requests across projects (#WI-634)
- Age-based color coding for PR freshness (#WI-634)
- Sorting and filtering by project, age, and status (#WI-634)

#### Timeline Page
- Cross-project activity feed with day-based grouping (#WI-635)
- Event filtering by project, domain, and event type (#WI-635)
- Date range filtering for historical browsing (#WI-635)

#### Real-Time Updates via reactiveSWR
- Server-Sent Events (SSE) provider for real-time cache invalidation (#WI-636)
- Automatic SSE polling with 30-second fallback for connection loss (#WI-636)
- Smart cache revalidation on push/merge events (#WI-636)

### Testing

- 914 tests passing across 42 test files
- Comprehensive test coverage for hooks, mappers, and page components
- E2E tests for dashboard, project, PR queue, and timeline pages
- Loading and error state testing

### Code Quality

- Biome linter: 0 errors, fully formatted codebase
- TypeScript strict mode enforced
- All UI components properly typed with Zod validation
- Proper error handling and fallbacks throughout

## [0.2.0] - 2026-03-16

### Added

#### Project Manifest & Configuration
- YAML-based project manifest schema (project.yaml) with Zod validation (#WI-587)
- Support for SDLC and content workflows with required and optional fields (#WI-587)
- Type definitions for manifest configuration (#WI-588)
- CLI configuration loader for reading ~/.devtrack/config.yaml (#WI-595)

#### PRD Parser & Sync
- PRD file parser extracting frontmatter (title, summary, status) and work items from markdown (#WI-589)
- Checkbox-based work item detection in PRD files (#WI-589)
- PRD type definitions for parsed frontmatter and work items (#WI-591)
- PRD sync service POSTing parsed PRDs and work items to API (#WI-590)

#### Claude Code Hooks
- Hook installer creating shell scripts for post-commit, post-push, pre-session, post-session events (#WI-592)
- .claude/settings.json integration with hook event routing (#WI-592)
- Hook type definitions for installation options and results (#WI-593)
- Hook logger for structured event logging (#WI-594)

#### Content Pipeline Integration
- Content file parser extracting frontmatter from markdown content files (#WI-597)
- Content sync service POSTing parsed content to API (#WI-598)
- Content type definitions for parser and sync (#WI-597, #WI-598)

#### GitHub Webhook Handler
- POST /api/v1/webhooks/github endpoint with HMAC-SHA256 signature verification (#WI-599)
- Pull request event handling (opened, closed, reopened, merged) (#WI-599)
- Pull request review event handling with status mapping (#WI-599)
- Push event handling for branch tracking (#WI-599)
- Branch creation/deletion event handling (#WI-599)
- Check suite completion event handling for CI status (#WI-599)
- Project matching via repo URL from webhook payload (#WI-599)

### Implementation Details

- All parsers use industry-standard libraries: gray-matter for frontmatter, yaml for YAML parsing
- Hook installation creates executable shell scripts with proper shebangs
- GitHub webhook signature verification uses timing-safe comparison to prevent timing attacks
- Event type mapping translates GitHub actions to DevTrack event types
- Comprehensive error handling with meaningful error messages

### Testing

- 197 additional unit tests covering manifest parsing, PRD parsing, hook installation, content parsing, and webhook handling
- Test coverage includes validation errors, edge cases, and webhook signature verification
- All tests passing with Vitest (449/450, 1 skipped)

### Code Quality

- Biome linter: 0 errors, fully formatted codebase
- TypeScript strict mode enforced
- All new modules have complete type definitions
- Error paths fully tested

## [0.1.0] - 2026-03-15

### Added

#### Core Data Model
- Prisma schema with 7 models: Project, Prd, WorkItem, ContentItem, Branch, PullRequest, Event (#WI-575)
- Zod validation schemas for all models with proper constraints (#WI-576)
- API response helpers: apiSuccess, paginatedResponse, parsePagination, buildPagination (#WI-578)

#### Authentication & Security
- API key authentication middleware with timing-safe comparison (#WI-577)
- HMAC-SHA256 signature validation for GitHub webhooks (#WI-584)

#### Projects API
- GET /api/v1/projects - List all projects with filtering by domain, workflow, tags (#WI-579)
- POST /api/v1/projects - Register a new project (#WI-579)
- GET /api/v1/projects/:id - Get project detail with current state summary (#WI-579)
- PATCH /api/v1/projects/:id - Update project configuration (#WI-579)
- DELETE /api/v1/projects/:id - Unregister a project (#WI-579)
- GET /api/v1/projects/:id/status - Computed status with active PRD progress, open PRs, health signals (#WI-579)

#### PRDs & Work Items API
- GET /api/v1/projects/:id/prds - List PRDs for a project (#WI-580)
- POST /api/v1/projects/:id/prds - Create/sync a PRD (#WI-580)
- GET /api/v1/prds/:id - Get PRD with work items (#WI-580)
- PATCH /api/v1/prds/:id - Update PRD status and summary (#WI-580)
- GET /api/v1/prds/:id/work-items - List work items for a PRD (#WI-580)
- POST /api/v1/prds/:id/work-items - Create/sync work items (#WI-580)
- PATCH /api/v1/work-items/:id - Update work item status (#WI-580)

#### Content Pipeline API
- GET /api/v1/projects/:id/content - List content items with status filtering (#WI-581)
- POST /api/v1/projects/:id/content - Add idea or sync draft (#WI-581)
- GET /api/v1/content/:id - Get content item detail (#WI-581)
- PATCH /api/v1/content/:id - Update content status and metadata (#WI-581)
- DELETE /api/v1/content/:id - Remove content item (#WI-581)

#### Pull Requests & Branches API
- GET /api/v1/prs - List all open PRs across projects (the PR queue) (#WI-582)
- GET /api/v1/projects/:id/prs - List PRs for a specific project (#WI-582)
- POST /api/v1/projects/:id/prs - Sync PR from GitHub webhook (#WI-582)
- PATCH /api/v1/prs/:id - Update PR status (#WI-582)
- GET /api/v1/projects/:id/branches - List branches for a project (#WI-582)
- POST /api/v1/projects/:id/branches - Register a branch (#WI-582)
- PATCH /api/v1/branches/:id - Update branch metadata and link to PRD (#WI-582)

#### Events & Timeline API
- GET /api/v1/events - Cross-project timeline with filtering by project, domain, type, date range (#WI-583)
- POST /api/v1/events - Record an event (used by hooks and webhooks) (#WI-583)
- GET /api/v1/projects/:id/events - Events for a single project (#WI-583)
- GET /api/v1/events/summary - Daily rollup summary across all projects (#WI-583)

#### GitHub Integration
- POST /api/v1/webhooks/github - GitHub webhook receiver with signature validation (#WI-584)
- Support for PR events (opened, reviewed, merged, closed) (#WI-584)
- Support for push events and branch tracking (#WI-584)

#### API Specification
- GET /api/v1/openapi.json - Complete OpenAPI 3.1 spec for API discovery and CLI generation (#WI-585)
- Full endpoint documentation with request/response schemas (#WI-585)

#### Environment Configuration
- DEVTRACK_API_KEY environment variable for API authentication
- Support for database connection via Prisma adapter

### Implementation Details

- All API endpoints use standard response envelope with data and metadata
- Pagination support on list endpoints (page, per_page parameters)
- Comprehensive error handling with 422 validation errors and field-level details
- PostgreSQL as the persistent data store via Prisma ORM
- Full TypeScript type safety across data layer and API surface

### Testing

- 252 unit tests covering schema validation, API responses, authentication, and all endpoint functionality
- Test coverage includes edge cases, error paths, and webhook signature validation
- All tests passing with Vitest

### Code Quality

- Biome linter: 0 errors, fully formatted codebase
- TypeScript strict mode
- Comprehensive validation with Zod schemas
- Error handling and type safety throughout

---

## Notes for Future Releases

- PRD 002 will add hook integration and GitHub webhook handling details
- PRD 003 will implement the web dashboard UI
- PRD 004 will generate the CLI tool from the OpenAPI spec
