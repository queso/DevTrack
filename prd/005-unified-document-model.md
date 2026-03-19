# PRD 005: Unified Document Model

## Summary

Collapse the separate SDLC and Content data models into a single unified model. Replace `Prd`, `WorkItem`, and `ContentItem` with `Document` and `Item`. Remove the `Workflow` enum as a code-path branching mechanism — use `tags` for categorization instead.

## Problem

The current codebase maintains two parallel pipelines for what is fundamentally the same thing: a document with child items that flow through a status pipeline.

- `Prd` (queued/in_progress/completed) + `WorkItem` (todo/in_progress/done)
- `ContentItem` (idea/draft/published)

This means two Prisma models, two sync parsers (`prd-sync.ts`, `content-sync.ts`), two sets of API endpoints, two rendering branches in the project detail page, two sets of event types, and two summary line builders. All for what amounts to a labeling difference.

The `ContentItem` state machine (`idea -> draft -> published`, no going back) adds artificial rigidity. DevTrack can't actually stop someone from editing a published piece in their editor — the tracking system should reflect reality, not fight it.

Meanwhile, the `tags` and `domain` fields on `Project` already exist for categorization. The `workflow` enum is redundant as a classification mechanism and harmful as a code-branching mechanism.

## Solution

### New Data Model

Replace `Prd`, `WorkItem`, and `ContentItem` with:

```
Document
├── id (uuid)
├── projectId (fk -> Project)
├── title (string)
├── summary (string?)
├── status (string) — free-form, e.g. "queued", "active", "done", "idea", "draft", "published"
├── sourcePath (string?) — path to source file in repo
├── tags (string[])
├── order (int, default: 0) — for display ordering
├── publishedAt (datetime?) — for content tracking
├── createdAt, updatedAt
│
├── items: Item[]
├── branches: Branch[]
├── pullRequests: PullRequest[]
└── events: Event[]

Item
├── id (uuid)
├── documentId (fk -> Document)
├── title (string)
├── status (string) — free-form, e.g. "todo", "in_progress", "done"
├── order (int)
├── createdAt, updatedAt
```

Key decisions:
- **Status is a free-form string**, not an enum. Different projects use different workflows — don't constrain them. The UI can still render status badges with known values and fall back to plain text for custom ones.
- **No state machine restrictions.** Items can move in any direction. The tracking system reflects reality.
- **Documents can have zero items.** A content piece with no checklist is just a document with no children. A PRD with a checklist has children. Same model.
- **Tags on Document** replace the workflow-driven categorization. A document tagged `prd` shows a progress bar. A document tagged `blog` shows in a content section. But the data model doesn't care.

### Remove Workflow Enum

Remove the `Workflow` enum from `Project`. The `workflow` field becomes unnecessary — projects are just projects. If you need to filter by type, use `tags` (already on `Project`).

The `project.yaml` manifest drops the `workflow` field. The `prd_path`, `content_path`, and `draft_path` fields collapse into a single `docs_path` (or keep all three as optional scan paths — the unified parser handles all of them the same way).

### Unified Sync Parser

Replace `prd-sync.ts` and `content-sync.ts` with a single `document-sync.ts`:

1. Glob configured path(s) for markdown files
2. Parse YAML frontmatter (title, summary, status, tags)
3. Create/update `Document` record
4. If file contains checklists (`- [ ]` / `- [x]`), extract as `Item` records
5. If no checklists, the document stands alone

Status inference from frontmatter:
- Explicit `status:` in frontmatter takes precedence
- Files in a `drafts/` directory default to status `"draft"`
- Files with `- [x]` all checked default to status `"done"` / `"completed"`
- Otherwise default to `"active"`

### Unified API Endpoints

Replace the current split:

```
# Current (remove these)
GET/POST  /projects/:id/prds
GET/PATCH /prds/:id
GET/POST  /prds/:id/work-items
PATCH     /work-items/:id
GET/POST  /projects/:id/content
GET/PATCH/DELETE /content/:id

# New (add these)
GET/POST  /projects/:id/documents
GET/PATCH/DELETE /documents/:id
GET/POST  /documents/:id/items
PATCH     /items/:id
```

The OpenAPI spec and swagger-jack CLI regenerate automatically.

### Unified UI Rendering

Replace the two conditional blocks in `ProjectPageClient.tsx` with one:

```tsx
{/* Active documents with progress */}
{activeDocuments.map(doc => (
  <DocumentCard
    key={doc.id}
    document={doc}
    showProgress={doc.items.length > 0}
  />
))}

{/* Pipeline sections based on status grouping */}
{statusGroups.map(group => (
  <StatusGroup key={group.label} label={group.label} documents={group.documents} />
))}
```

The `DocumentCard` component:
- Shows a progress bar if the document has items (replaces SDLC-only progress bar)
- Shows item list with status indicators
- Shows linked PRs and branches
- Works the same regardless of what the project's tags say

Status grouping is driven by the actual status values present, not by a workflow enum:
- Documents with status `"active"` or `"in_progress"` go under "Current Work"
- Documents with status `"queued"` go under "Up Next"
- Documents with status `"done"` or `"completed"` go under "Shipped"
- Documents with status `"draft"` go under "Drafts"
- Documents with status `"idea"` go under "Ideas"
- Documents with status `"published"` go under "Published"

If a project only has `active/queued/done` documents, it looks like the current SDLC view. If it only has `idea/draft/published`, it looks like the current content view. No branching needed.

### Summary Line

Replace `buildSdlcSummaryLine` and `buildContentSummaryLine` with one function:

```typescript
function buildSummaryLine(project): string {
  const active = documents.filter(d => d.status === "active" || d.status === "in_progress")
  if (active.length > 0) {
    const doc = active[0]
    const done = doc.items.filter(i => i.status === "done").length
    const total = doc.items.length
    if (total > 0) return `${doc.title} — ${done}/${total} done`
    return doc.title
  }
  // Fall back to counts
  const drafts = documents.filter(d => d.status === "draft").length
  const ideas = documents.filter(d => d.status === "idea").length
  if (drafts > 0) return `${drafts} draft${drafts > 1 ? "s" : ""} in progress`
  if (ideas > 0) return `${ideas} idea${ideas > 1 ? "s" : ""} queued`
  return "No active work"
}
```

### Event Types

Consolidate:

```
# Remove these specific types
prd_created, prd_updated, prd_completed, prd_synced
work_item_created, work_item_completed
content_published, content_updated

# Replace with
document_created
document_updated
document_completed
document_synced
item_created
item_completed
```

### Migration

Prisma migration to:
1. Create `Document` and `Item` tables
2. Migrate `Prd` rows -> `Document` rows (add tag `"prd"`)
3. Migrate `WorkItem` rows -> `Item` rows
4. Migrate `ContentItem` rows -> `Document` rows (add tag based on status)
5. Update `Branch`, `PullRequest`, `Event` foreign keys from `prdId` -> `documentId`
6. Drop `Prd`, `WorkItem`, `ContentItem` tables
7. Drop `Workflow` enum, `PrdStatus`, `WorkItemStatus`, `ContentItemStatus` enums
8. Remove `workflow` from `Project`
9. Rename/consolidate `prdPath`/`contentPath`/`draftPath` on `Project` to `docPaths` (string array) or keep as optional fields

### Manifest Changes

```yaml
# Before
name: my-project
workflow: sdlc
prd_path: prd/

# After
name: my-project
tags:
  - backend
  - api
doc_paths:
  - prd/
  - docs/
```

The `workflow` field is removed. `doc_paths` replaces `prd_path`/`content_path`/`draft_path` as an array of directories to scan. The sync parser treats them all the same.

### CLI Changes

- `devtrack register` — stops sending `workflow`, sends `tags` and `doc_paths`
- `devtrack sync` — calls unified sync endpoint
- `devtrack ideas` — becomes `devtrack docs` or just uses `devtrack documents list --status idea`
- Generated commands update automatically when OpenAPI spec changes

## What We Delete

- `enum Workflow` (Prisma + OpenAPI + Go CLI + TypeScript types)
- `enum PrdStatus`, `enum WorkItemStatus`, `enum ContentItemStatus`
- `model Prd`, `model WorkItem`, `model ContentItem`
- `lib/prd-sync.ts`, `lib/content-sync.ts` (replaced by `document-sync.ts`)
- `lib/prd-parser.ts`, `lib/content-parser.ts` (replaced by `document-parser.ts`)
- All `project.workflow === "sdlc"` / `"content"` conditional rendering
- `buildSdlcSummaryLine`, `buildContentSummaryLine` (replaced by one function)
- 6 workflow-specific event types
- Duplicate API endpoints (`/prds`, `/content`, `/work-items`)

## What We Keep

- `Project` model (minus `workflow` field)
- `Branch`, `PullRequest`, `Event` models (updated FK references)
- `tags` on both `Project` and `Document` for flexible categorization
- Dashboard filtering — now by tags instead of workflow enum
- All shared infrastructure: PR queue, timeline, hooks, webhooks

## Non-Goals

- Custom status pipeline definitions per project (just use free-form strings)
- Document templates or scaffolding
- Workflow enforcement or approval gates
