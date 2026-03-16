# DevTrack Architecture

## System Overview

DevTrack is a multi-repo development tracking system with the following components:

```
[Repo Hooks] ──────────→ [DevTrack API] ←────── [GitHub Webhooks]
                            │
                       [PostgreSQL]
                            │
                ┌───────────┴───────────┐
                │                       │
           [Dashboard]            [CLI Tool]
```

## Core Components

### 1. API Layer (`/api/v1`)

The REST API serves as the central hub for all data operations.

**Architecture:**
- **Framework:** Next.js App Router
- **Language:** TypeScript (strict mode)
- **Validation:** Zod schemas for all request bodies
- **Authentication:** API key via timing-safe comparison
- **Response Format:** Standard envelope with data and metadata

**Key Modules:**
- `lib/auth.ts` - Authentication middleware
- `lib/schemas/` - Zod validation schemas
- `lib/api/` - Response helpers and error handling
- `app/api/v1/` - Endpoint implementations

### 2. Data Layer

**Database:** PostgreSQL via Prisma ORM

**Schema Location:** `prisma/schema.prisma`

**Key Models:**
- `Project` - Core entity representing tracked repositories
- `Prd` - Product requirements documents (features)
- `WorkItem` - Individual tasks within PRDs
- `ContentItem` - Content pipeline tracking (idea → draft → published)
- `Branch` - Active branches per project
- `PullRequest` - PR state from GitHub
- `Event` - Activity timeline entries

**Features:**
- Automatic timestamps (createdAt, updatedAt)
- Foreign key relationships with cascading deletes
- JSON fields for flexible metadata (Event.metadata)
- Enum types for workflow states

### 3. Authentication & Security

**API Key Authentication:**
- Single environment variable: `DEVTRACK_API_KEY`
- Passed via `Authorization: Bearer <key>` header
- Validated with timing-safe comparison in middleware
- Protects all `/api/v1/*` endpoints

**Webhook Validation:**
- GitHub webhooks signed with HMAC-SHA256
- Signature verified against API key
- Header: `X-Hub-Signature-256: sha256=<hash>`

### 4. Response Format

All responses use a standard envelope for consistency:

**Success (2xx):**
```json
{
  "data": { /* payload */ },
  "meta": { /* pagination/metadata */ }
}
```

**Validation Error (422):**
```json
{
  "error": "Validation failed",
  "details": {
    "field_name": "Error message"
  }
}
```

**Generic Error (4xx/5xx):**
```json
{
  "error": "Error message"
}
```

## Endpoint Organization

### Projects Management
- `GET /projects` - List with filtering
- `POST /projects` - Register new project
- `GET /projects/:id` - Single project
- `PATCH /projects/:id` - Update configuration
- `DELETE /projects/:id` - Remove project
- `GET /projects/:id/status` - Computed status

### Feature Tracking (PRDs & Work Items)
- `GET /projects/:id/prds` - List project features
- `POST /projects/:id/prds` - Create/sync PRD
- `GET /prds/:id` - PRD with work items
- `PATCH /prds/:id` - Update PRD status
- `GET /prds/:id/work-items` - Work items
- `POST /prds/:id/work-items` - Create/sync items
- `PATCH /work-items/:id` - Update item status

### Content Pipeline
- `GET /projects/:id/content` - List content
- `POST /projects/:id/content` - Add idea or sync draft
- `GET /content/:id` - Single content item
- `PATCH /content/:id` - Update status
- `DELETE /content/:id` - Remove item

### Pull Requests & Branches
- `GET /prs` - All open PRs (PR queue)
- `GET /projects/:id/prs` - Project PRs
- `POST /projects/:id/prs` - Sync PR
- `PATCH /prs/:id` - Update PR
- `GET /projects/:id/branches` - Project branches
- `POST /projects/:id/branches` - Register branch
- `PATCH /branches/:id` - Update branch

### Events & Timeline
- `GET /events` - Cross-project timeline
- `POST /events` - Record event
- `GET /projects/:id/events` - Project events
- `GET /events/summary` - Daily summary

### Integration
- `POST /webhooks/github` - GitHub webhook receiver
- `GET /openapi.json` - OpenAPI 3.1 spec

## Data Flow

### Project Registration Flow
```
1. Client: POST /projects with project details
2. API: Validate with Zod schema
3. API: Create Project record in database
4. API: Return Project with UUID
5. Client: Use project_id for all subsequent operations
```

### PR Sync Flow (via GitHub Webhook)
```
1. GitHub: Send webhook with PR event
2. Webhook Handler: Verify HMAC-SHA256 signature
3. Webhook Handler: Extract PR data from payload
4. API: Validate PR schema
5. API: Create or update PullRequest record
6. API: Record Event with type 'pr_*'
7. API: Return success response
```

### Event Recording Flow
```
1. Hook/Webhook: Record significant action
2. API: POST /events with event data
3. API: Create Event record with timestamp
4. API: Link to Project, PRD, or PR if applicable
5. Dashboard/CLI: Query /events for timeline
```

## Database Migrations

Migrations are managed by Prisma:

```bash
# Create migration
pnpm exec prisma migrate dev --name add_feature

# Apply migrations
pnpm exec prisma migrate deploy

# Generate Prisma client
pnpm exec prisma generate
```

All migrations are checked into version control.

## Testing Strategy

**Unit Tests:** All major components have unit tests
- Schema validation tests (`__tests__/schemas.test.ts`)
- API response helper tests (`__tests__/api-response.test.ts`)
- Authentication tests (`__tests__/auth-middleware.test.ts`)
- Endpoint tests (`__tests__/api/`)
- Webhook validation tests

**Coverage:** 252 tests covering:
- Request validation
- Error paths
- Successful operations
- Webhook signature validation
- Pagination
- Filtering

**Command:**
```bash
pnpm test
```

## Code Quality

**Linting:** Biome (0 errors)
```bash
pnpm run lint
```

**Type Safety:** TypeScript strict mode throughout

**Validation:** Zod schemas on all request bodies

## OpenAPI Specification

The API generates a complete OpenAPI 3.1 spec at `/openapi.json`.

**Usage:**
- Serves as API documentation
- Used by swagger-jack to generate CLI tool
- Defines request/response schemas
- Enumerates all endpoints and operations

## Future Architectural Changes

Planned improvements for subsequent PRDs:

### PRD 002: Repo Integration
- Hook system for local repo state capture
- Webhook handling details
- Manifest file parsing

### PRD 003: Dashboard
- Next.js UI components
- Real-time data sync via WebSockets
- Project and work item views

### PRD 004: CLI
- Auto-generated from OpenAPI spec
- swagger-jack integration
- Command-line interface for all API operations

## Performance Considerations

- Pagination on list endpoints (default 20 items per page)
- Indexed fields: project.name, prd.project_id, etc.
- Event recording can be batch-processed in future
- WebSocket support planned for real-time updates

## Security Considerations

- API key in environment variable (not in code)
- Timing-safe comparison for key validation
- HMAC-SHA256 signature validation for webhooks
- Zod validation prevents injection attacks
- TypeScript type safety
- No secrets in responses or logs

## Deployment

- **Container:** Docker (provided)
- **Orchestration:** Kubernetes (OVH Cloud)
- **Environment:** Supports multiple deployment targets
- **Health Check:** `/health` endpoint
