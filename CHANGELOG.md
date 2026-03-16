# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
