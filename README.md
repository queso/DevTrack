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
