# DevTrack API Reference

## Overview

The DevTrack API provides a REST interface for managing multi-repository development tracking. All endpoints are prefixed with `/api/v1` and use standard JSON response envelopes.

## Authentication

All API requests require an API key passed via the `Authorization` header:

```
Authorization: Bearer <API_KEY>
```

The API key is configured via the `DEVTRACK_API_KEY` environment variable. Validation uses timing-safe comparison to prevent timing attacks.

## Response Format

All successful responses use a standard envelope:

```json
{
  "data": { /* response payload */ },
  "meta": { /* pagination and metadata */ }
}
```

For paginated endpoints:

```json
{
  "data": [
    { /* item 1 */ },
    { /* item 2 */ }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "per_page": 20
  }
}
```

## Error Handling

Validation errors return HTTP 422 with field-level details:

```json
{
  "error": "Validation failed",
  "details": {
    "name": "Project name is required",
    "workflow": "Invalid workflow type"
  }
}
```

## Data Models

### Project

The core entity representing a tracked repository.

```typescript
{
  id: string;                    // UUID
  name: string;                  // Unique project identifier
  workflow: 'sdlc' | 'content';  // Workflow type
  domain: string;                // Domain identifier (e.g., 'aiteam')
  owner: string;                 // Project owner
  tags: string[];                // Optional tags for grouping
  repo_url: string;              // GitHub repository URL
  main_branch: string;           // Default: 'main'
  branch_prefix?: string;        // Branch naming prefix (e.g., 'feat/')
  prd_path?: string;             // Path to PRD files (e.g., 'briefings/')
  test_pattern?: string;         // Test file pattern (e.g., '**/*.test.ts')
  content_path?: string;         // Content directory (for content workflow)
  draft_path?: string;           // Draft content directory
  deploy_environment?: string;   // Deployment environment
  deploy_url?: string;           // Deployment URL for health checks
  deploy_health_check?: string;  // Health check endpoint path
  last_activity_at: string;      // ISO 8601 timestamp
  created_at: string;            // ISO 8601 timestamp
  updated_at: string;            // ISO 8601 timestamp
}
```

### PRD (Product Requirements Document)

Represents a tracked feature or work unit.

```typescript
{
  id: string;           // UUID
  project_id: string;   // Foreign key to Project
  title: string;        // Feature title
  summary: string;      // One-liner description
  status: 'queued' | 'in_progress' | 'completed';
  source_path: string;  // File path in repo (e.g., 'briefings/feature.md')
  work_items: WorkItem[];
  created_at: string;   // ISO 8601 timestamp
  updated_at: string;   // ISO 8601 timestamp
}
```

### WorkItem

Individual tasks within a PRD.

```typescript
{
  id: string;           // UUID
  prd_id: string;       // Foreign key to PRD
  title: string;        // Task title
  status: 'todo' | 'in_progress' | 'done';
  order: number;        // Display order
  created_at: string;   // ISO 8601 timestamp
  updated_at: string;   // ISO 8601 timestamp
}
```

### ContentItem

Represents items in a content pipeline (idea → draft → published).

```typescript
{
  id: string;                      // UUID
  project_id: string;              // Foreign key to Project
  title: string;                   // Content title
  summary: string;                 // Brief description
  status: 'idea' | 'draft' | 'published';
  source_path?: string;            // File path (null for ideas)
  tags: string[];                  // Content tags
  published_at?: string;           // Publication timestamp (ISO 8601)
  created_at: string;              // ISO 8601 timestamp
  updated_at: string;              // ISO 8601 timestamp
}
```

### Branch

Active branches tracked per project.

```typescript
{
  id: string;           // UUID
  project_id: string;   // Foreign key to Project
  prd_id?: string;      // Optional foreign key to PRD
  name: string;         // Branch name
  is_active: boolean;   // Whether branch is still active
  created_at: string;   // ISO 8601 timestamp
  updated_at: string;   // ISO 8601 timestamp
}
```

### PullRequest

PR state synced from GitHub.

```typescript
{
  id: string;                                        // UUID
  project_id: string;                                // Foreign key to Project
  branch_id?: string;                                // Optional foreign key to Branch
  prd_id?: string;                                   // Optional foreign key to PRD
  github_id: number;                                 // GitHub PR ID
  number: number;                                    // PR number
  title: string;                                     // PR title
  status: 'draft' | 'open' | 'reviewed' | 'changes_requested' | 'approved' | 'merged' | 'closed';
  url: string;                                       // GitHub PR URL
  author: string;                                    // GitHub username
  check_status?: 'pending' | 'passing' | 'failing'; // CI/CD check status
  opened_at: string;                                 // ISO 8601 timestamp
  merged_at?: string;                                // ISO 8601 timestamp (if merged)
  created_at: string;                                // ISO 8601 timestamp
  updated_at: string;                                // ISO 8601 timestamp
}
```

### Event

Activity timeline entry.

```typescript
{
  id: string;           // UUID
  project_id: string;   // Foreign key to Project
  prd_id?: string;      // Optional foreign key to PRD
  pull_request_id?: string;  // Optional foreign key to PullRequest
  type: EventType;      // Event type (see below)
  title: string;        // Human-readable one-liner
  metadata: Record<string, unknown>;  // Flexible event payload
  occurred_at: string;  // ISO 8601 timestamp
  created_at: string;   // ISO 8601 timestamp
}
```

Event types include:
- `commit` - Code commit
- `branch_created` - Branch creation
- `branch_deleted` - Branch deletion
- `pr_opened` - PR opened
- `pr_reviewed` - PR review requested/submitted
- `pr_merged` - PR merged
- `pr_closed` - PR closed
- `prd_created` - PRD created
- `prd_updated` - PRD updated
- `prd_completed` - PRD completed
- `deploy` - Deployment event
- `content_idea_added` - Content idea added
- `content_draft_started` - Content draft started
- `content_published` - Content published

## API Endpoints

### Projects

#### List Projects

```
GET /projects
```

Query parameters:
- `page` (number, default: 1) - Page number
- `per_page` (number, default: 20) - Items per page
- `domain` (string, optional) - Filter by domain
- `workflow` (string, optional) - Filter by workflow type (sdlc, content)
- `tags` (string, optional) - Filter by tag (comma-separated)

Response:
```json
{
  "data": [
    { /* Project */ }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "per_page": 20
  }
}
```

#### Create Project

```
POST /projects
```

Request body:
```json
{
  "name": "my-project",
  "workflow": "sdlc",
  "domain": "aiteam",
  "owner": "team",
  "repo_url": "https://github.com/user/my-project",
  "main_branch": "main",
  "tags": ["platform", "critical"]
}
```

#### Get Project

```
GET /projects/:id
```

Response: Single Project object

#### Update Project

```
PATCH /projects/:id
```

Request body: Partial Project object

#### Delete Project

```
DELETE /projects/:id
```

#### Get Project Status

```
GET /projects/:id/status
```

Returns computed status including:
- Active PRD with progress
- Open PRs count
- Last activity timestamp
- Health signals

### PRDs & Work Items

#### List PRDs

```
GET /projects/:id/prds
```

#### Create PRD

```
POST /projects/:id/prds
```

Request body:
```json
{
  "title": "Add user authentication",
  "summary": "Implement OAuth2 login flow",
  "status": "queued",
  "source_path": "briefings/auth.md"
}
```

#### Get PRD with Work Items

```
GET /prds/:id
```

#### Update PRD

```
PATCH /prds/:id
```

#### List Work Items

```
GET /prds/:id/work-items
```

#### Create Work Items

```
POST /prds/:id/work-items
```

Request body:
```json
[
  {
    "title": "Implement OAuth provider",
    "status": "todo",
    "order": 1
  },
  {
    "title": "Add login UI",
    "status": "todo",
    "order": 2
  }
]
```

#### Update Work Item

```
PATCH /work-items/:id
```

Request body:
```json
{
  "status": "in_progress"
}
```

### Content Pipeline

#### List Content Items

```
GET /projects/:id/content
```

Query parameters:
- `status` (string, optional) - Filter by status (idea, draft, published)
- `page` (number, default: 1)
- `per_page` (number, default: 20)

#### Create Content Item

```
POST /projects/:id/content
```

Request body:
```json
{
  "title": "Getting started guide",
  "summary": "Introduction to DevTrack",
  "status": "idea",
  "tags": ["docs", "tutorial"]
}
```

#### Get Content Item

```
GET /content/:id
```

#### Update Content Item

```
PATCH /content/:id
```

Request body:
```json
{
  "status": "draft",
  "source_path": "content/guides/getting-started.md"
}
```

#### Delete Content Item

```
DELETE /content/:id
```

### Pull Requests & Branches

#### List All Open PRs

```
GET /prs
```

Query parameters:
- `page` (number, default: 1)
- `per_page` (number, default: 20)

Returns all open PRs across all projects (the "PR queue").

#### List Project PRs

```
GET /projects/:id/prs
```

#### Sync PR from Webhook

```
POST /projects/:id/prs
```

Request body:
```json
{
  "github_id": 123,
  "number": 45,
  "title": "Add feature X",
  "status": "open",
  "url": "https://github.com/user/repo/pull/45",
  "author": "github-user",
  "opened_at": "2026-03-15T10:30:00Z"
}
```

#### Update PR

```
PATCH /prs/:id
```

Request body:
```json
{
  "status": "merged",
  "merged_at": "2026-03-15T11:00:00Z"
}
```

#### List Project Branches

```
GET /projects/:id/branches
```

#### Register Branch

```
POST /projects/:id/branches
```

Request body:
```json
{
  "name": "feat/new-feature",
  "prd_id": "optional-prd-uuid"
}
```

#### Update Branch

```
PATCH /branches/:id
```

Request body:
```json
{
  "is_active": false,
  "prd_id": "updated-prd-uuid"
}
```

### Events & Timeline

#### List Events

```
GET /events
```

Query parameters:
- `project_id` (string, optional) - Filter by project
- `domain` (string, optional) - Filter by domain
- `type` (string, optional) - Filter by event type
- `start_date` (ISO 8601, optional) - Start of date range
- `end_date` (ISO 8601, optional) - End of date range
- `page` (number, default: 1)
- `per_page` (number, default: 20)

#### Record Event

```
POST /events
```

Request body:
```json
{
  "project_id": "project-uuid",
  "prd_id": "optional-prd-uuid",
  "pull_request_id": "optional-pr-uuid",
  "type": "pr_merged",
  "title": "Merged PR #45: Add feature X",
  "metadata": {
    "pr_number": 45,
    "author": "developer"
  },
  "occurred_at": "2026-03-15T11:00:00Z"
}
```

#### List Project Events

```
GET /projects/:id/events
```

#### Get Event Summary

```
GET /events/summary
```

Query parameters:
- `date` (ISO 8601 date, optional) - Summary for specific date (default: today)

Response:
```json
{
  "data": {
    "summary": "5 commits across 3 projects, 1 PR merged",
    "event_counts": {
      "commit": 5,
      "pr_merged": 1,
      "deploy": 1
    }
  },
  "meta": {}
}
```

### GitHub Webhooks

#### Receive GitHub Webhook

```
POST /webhooks/github
```

GitHub sends webhook payloads signed with HMAC-SHA256. The signature is validated using the `DEVTRACK_API_KEY`.

Expected header:
```
X-Hub-Signature-256: sha256=<hmac-sha256-hash>
```

Supported events:
- Pull request events (opened, reopened, closed, synchronize, review_requested, submitted)
- Push events (branch creation/deletion tracking)

### Health Check

#### Check API Health

```
GET /health
```

Response:
```json
{
  "status": "ok"
}
```

## Rate Limiting

Currently, the API does not enforce rate limiting. This may be added in a future release.

## OpenAPI Specification

The complete OpenAPI 3.1 specification is available at:

```
GET /openapi.json
```

This spec is used to auto-generate the CLI tool via swagger-jack.
