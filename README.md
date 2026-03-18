# DevTrack

Mission control for multi-repo development. Track SDLC state, content pipelines, and PR queues across all your projects from one dashboard.

## Tech Stack

Built on [context-kit](https://github.com/queso/context-kit):

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript
- **Database:** PostgreSQL via Prisma (with `@prisma/adapter-pg`)
- **UI:** Tailwind CSS 4, shadcn/ui, Radix UI, Lucide icons
- **Data Fetching:** SWR + reactiveSWR
- **Testing:** Vitest, Testing Library, FlowSpec (e2e)
- **Linting/Formatting:** Biome
- **Validation:** Zod
- **Logging:** Pino
- **Deployment:** Docker, Kubernetes (OVH Cloud)
- **CLI:** Auto-generated from OpenAPI spec via swagger-jack

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL 14+

### Setup

1. Install dependencies:
```bash
pnpm install
```

2. Set up the database:
```bash
# Create .env.local with your database URL
DATABASE_URL="postgresql://user:password@localhost:5432/devtrack"

# Run migrations
pnpm exec prisma migrate deploy

# Generate Prisma client
pnpm exec prisma generate
```

3. Configure API authentication:
```bash
# Add to .env.local
DEVTRACK_API_KEY="your-secure-api-key-here"
```

4. Start the development server:
```bash
pnpm run dev
```

The dashboard will be available at `http://localhost:3000`.
The API will be available at `http://localhost:3000/api/v1`.

### API Documentation

The API is fully documented with an OpenAPI 3.1 spec available at `/api/v1/openapi.json`.

#### Authentication

All API requests require an API key passed via the `Authorization` header:

```bash
curl -H "Authorization: Bearer $DEVTRACK_API_KEY" \
  http://localhost:3000/api/v1/projects
```

#### Example: Register a Project

```bash
curl -X POST http://localhost:3000/api/v1/projects \
  -H "Authorization: Bearer $DEVTRACK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-project",
    "workflow": "sdlc",
    "domain": "aiteam",
    "owner": "team",
    "repo_url": "https://github.com/user/my-project",
    "main_branch": "main"
  }'
```

#### Key Endpoints

- **Projects:** `/api/v1/projects` - Register and manage tracked projects
- **PRDs & Work Items:** `/api/v1/projects/{id}/prds` - Track features and tasks
- **Content Pipeline:** `/api/v1/projects/{id}/content` - Manage ideas, drafts, and published content
- **Pull Requests:** `/api/v1/prs` - Monitor PR queue across all projects
- **Events & Timeline:** `/api/v1/events` - Track activity and create a unified timeline
- **GitHub Webhooks:** `/api/v1/webhooks/github` - Receive GitHub events

See `prd/001-core-api.md` for complete API specification.

## CLI Tool

The DevTrack CLI provides command-line access to all API features plus convenience commands for common workflows.

### Installation

The CLI is built from the OpenAPI spec using swagger-jack:

```bash
# Build the CLI
go build -o devtrack ./cli

# Install to your PATH
go install ./cli
```

### Quick Start

Register your project and view its status:

```bash
# Register the current repo with DevTrack
devtrack register

# View project status
devtrack status

# Show cross-project dashboard
devtrack dashboard
```

### Key Commands

**Project Management:**
- `devtrack register` — Register a repository
- `devtrack projects list` — List all registered projects
- `devtrack projects get` — Get project details
- `devtrack status` — Show status of current project

**PRDs & Work Items:**
- `devtrack prds list` — List PRDs for a project
- `devtrack prds create` — Create/sync a PRD
- `devtrack work-items list` — List work items for a PRD

**Pull Requests:**
- `devtrack prs` — List open PRs across all projects
- `devtrack pr-sync` — Trigger PR synchronization

**Activity Tracking:**
- `devtrack event` — Record an event with type validation
- `devtrack hooks install` — Install git hooks for automatic tracking
- `devtrack hooks uninstall` — Remove installed hooks

**Content Pipeline:**
- `devtrack ideas list` — List content ideas
- `devtrack ideas add` — Add a new idea

For all available commands and options:

```bash
devtrack help
devtrack [command] help
```

## Repository Integration

DevTrack integrates with your repositories through three mechanisms:

### Project Manifest

Each repository declares itself to DevTrack via a `project.yaml` file at the repo root:

```yaml
name: "my-project"
workflow: sdlc
domain: my-domain
owner: your-name
main_branch: main
prd_path: "prd/"
test_pattern: "**/*.test.ts"
```

The manifest defines the project's workflow type (SDLC or content), structure, and integration points.

### Claude Code Hooks

DevTrack installs hooks in `.claude/settings.json` that fire on development events:

- **post-commit**: Records commit activity
- **post-push**: Records push events
- **pre-session**: Marks project as active
- **post-session**: Records session duration

Hooks are installed via `devtrack register` or `devtrack hooks install`.

### GitHub Webhooks

GitHub events are received at `/api/v1/webhooks/github`:

- Pull request lifecycle (opened, reviewed, merged, closed)
- Push events and branch tracking
- CI check suite completion

Configure webhooks in GitHub repository settings or via `devtrack register --setup-webhook`.

## Architecture

```
[Repo Hooks] ──→ [DevTrack API] ←── [GitHub Webhooks]
                      │
                 [PostgreSQL]
                      │
              ┌───────┴───────┐
              │               │
         [Dashboard]     [CLI Tool]
```

## PRDs

- `prd/001-core-api.md` - Core API, data model, OpenAPI spec
- `prd/002-repo-integration.md` - Manifests, hooks, GitHub webhooks
- `prd/003-dashboard.md` - Web UI and project views
- `prd/004-cli.md` - CLI tool generated from OpenAPI spec
