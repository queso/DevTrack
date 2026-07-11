# DevTrack

Mission control for multi-repo development. Track SDLC state, content pipelines, and PR queues across all your projects from one dashboard.

## Tech Stack

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
- **Package Manager:** pnpm

## Directory Structure

```
web/                    Next.js application (run all pnpm commands from here)
web/app/                Next.js App Router pages and layouts
web/components/         React components (shadcn/ui)
web/lib/                Shared utilities, database, logging
web/prisma/             Prisma schema and migrations
web/specs/              OpenAPI/FlowSpec specifications
web/__tests__/          Test files
web/types/              TypeScript type definitions
web/public/             Static assets
cli/                    Go CLI (auto-generated from OpenAPI spec)
prd/                    Product Requirements Documents (NNNN-slug.md)
docs/                   Technical documentation, architecture decisions, API specs
.claude-plugin/         Claude Code plugin manifest and metadata
bin/                    Plugin executables and entry points
commands/               Slash command definitions (devtrack:*)
hooks/                  Claude Code hook scripts (post-commit, post-push, etc.)
scripts/                Build, release, and utility scripts
```

## Commands

All pnpm commands must be run from the `web/` directory:

- `pnpm run dev` - Start development server
- `pnpm run lint` - Run Biome linter
- `pnpm test` - Run Vitest unit tests
- `pnpm run test:e2e` - Run FlowSpec e2e tests

## A(i)-Team Integration

This project uses the A(i)-Team plugin for PRD-driven development.

### When to Use A(i)-Team

Use the A(i)-Team workflow when:
- Implementing features from a PRD document
- Working on multi-file changes that benefit from TDD
- Building features that need structured test → implement → review flow

### Commands

- `/ai-team:plan <prd-file>` - Decompose a PRD into tracked work items
- `/ai-team:run` - Execute the mission with parallel agents
- `/ai-team:status` - Check current progress
- `/ai-team:resume` - Resume an interrupted mission

### Workflow

1. Place your PRD in the `prd/` directory
2. Run `/ai-team:plan prd/your-feature.md`
3. Run `/ai-team:run` to execute

The A(i)-Team will:
- Break down the PRD into testable units
- Write tests first (TDD)
- Implement to pass tests
- Review each feature
- Probe for bugs
- Update documentation and commit

**Do NOT** work on PRD features directly without using `/ai-team:plan` first.

## DevTrack Plugin

DevTrack ships as a Claude Code plugin that installs slash commands and hooks into your development environment.

### Installation

```bash
# Install the DevTrack plugin
claude plugin install devtrack

# Run setup to register the current repo and install hooks
/devtrack:setup
```

### Slash Commands

| Command | Description |
|---|---|
| `/devtrack:setup` | Register the current repo and install git/Claude hooks |
| `/devtrack:status` | Show current project status (branch, open PRs, active PRD) |
| `/devtrack:dashboard` | Display cross-project dashboard summary |
| `/devtrack:sync` | Force-sync project state (PRDs, PRs, events) with DevTrack API |
| `/devtrack:prs` | List open pull requests across all tracked projects |

### Environment Variables

| Variable | Description |
|---|---|
| `DEVTRACK_API_URL` | Base URL of the DevTrack API (e.g. `https://devtrack.example.com`) |
| `DEVTRACK_API_KEY` | API key for authenticating requests to the DevTrack API |

Set these in your shell profile or `.env.local`:

```bash
export DEVTRACK_API_URL="https://devtrack.example.com"
export DEVTRACK_API_KEY="your-secure-api-key-here"
```
