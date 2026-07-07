import { z } from "zod"

// ---------------------------------------------------------------------------
// Shared / primitives
// ---------------------------------------------------------------------------

export const uuidParamSchema = z.object({
  id: z.string().uuid(),
})

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
})

export const envelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: z
      .object({
        total: z.number(),
        page: z.number(),
        per_page: z.number(),
      })
      .optional(),
  })

// ---------------------------------------------------------------------------
// Enums (must match Prisma enum values exactly)
// ---------------------------------------------------------------------------

const prdStatusEnum = z.enum(["queued", "in_progress", "completed"])
const workItemStatusEnum = z.enum(["todo", "in_progress", "done"])
const pullRequestStatusEnum = z.enum([
  "open",
  "closed",
  "merged",
  "draft",
  "review_requested",
  "changes_requested",
  "approved",
])
const checkStatusEnum = z.enum(["pending", "passing", "failing"])
const eventTypeEnum = z.enum([
  "pr_opened",
  "pr_merged",
  "pr_closed",
  "pr_review_requested",
  "pr_changes_requested",
  "pr_approved",
  "branch_created",
  "branch_deleted",
  "prd_created",
  "prd_updated",
  "prd_completed",
  "work_item_created",
  "work_item_completed",
  "commit",
  "push",
  "session_start",
  "session_end",
  "pr_reviewed",
  "prd_synced",
])

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export const createProjectSchema = z.object({
  name: z.string().min(1),
  workflow: z.literal("sdlc").default("sdlc"),
  domain: z.string().optional(),
  owner: z.string().optional(),
  tags: z.array(z.string()).default([]),
  repo_url: z.string().url().optional(),
  repo_path: z.string().optional(),
  main_branch: z.string().default("main"),
  branch_prefix: z.string().optional(),
  prd_path: z.string().optional(),
  test_pattern: z.string().optional(),
  deploy_environment: z.string().optional(),
  deploy_url: z.string().url().optional(),
  deploy_health_check: z.string().optional(),
})

export const updateProjectSchema = createProjectSchema.partial()

export const projectResponseSchema = createProjectSchema.extend({
  id: z.string().uuid(),
  last_activity_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const projectListQuerySchema = paginationQuerySchema.extend({
  domain: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

// ---------------------------------------------------------------------------
// PRD
// ---------------------------------------------------------------------------

export const createPrdSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string().optional(),
  status: prdStatusEnum.default("queued"),
  source_path: z.string().optional(),
})

export const updatePrdSchema = createPrdSchema.partial()

export const prdResponseSchema = createPrdSchema.extend({
  id: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

// ---------------------------------------------------------------------------
// WorkItem
// ---------------------------------------------------------------------------

export const createWorkItemSchema = z.object({
  prd_id: z.string().uuid(),
  title: z.string().min(1),
  status: workItemStatusEnum.default("todo"),
  order: z.number().int().min(0),
})

export const updateWorkItemSchema = createWorkItemSchema.partial()

export const workItemResponseSchema = createWorkItemSchema.extend({
  id: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

// ---------------------------------------------------------------------------
// Branch
// ---------------------------------------------------------------------------

export const createBranchSchema = z.object({
  project_id: z.string().uuid(),
  prd_id: z.string().uuid().optional().nullable(),
  name: z.string().min(1),
  is_active: z.boolean().default(true),
})

export const updateBranchSchema = createBranchSchema.partial()

export const branchResponseSchema = createBranchSchema.extend({
  id: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

// ---------------------------------------------------------------------------
// PullRequest
// ---------------------------------------------------------------------------

export const createPrSchema = z.object({
  project_id: z.string().uuid(),
  branch_id: z.string().uuid().optional().nullable(),
  prd_id: z.string().uuid().optional().nullable(),
  github_id: z.number().int(),
  number: z.number().int(),
  title: z.string().min(1),
  status: pullRequestStatusEnum.default("open"),
  url: z.string().url(),
  author: z.string().min(1),
  check_status: checkStatusEnum.optional().nullable(),
  opened_at: z.string().datetime(),
  merged_at: z.string().datetime().optional().nullable(),
})

export const updatePrSchema = createPrSchema.partial()

export const prResponseSchema = createPrSchema.extend({
  id: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const prListQuerySchema = paginationQuerySchema.extend({
  project_id: z.string().uuid().optional(),
  status: pullRequestStatusEnum.optional(),
  author: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Event
// ---------------------------------------------------------------------------

// A project may be identified by UUID (project_id) or by unique name
// (project_name). Name resolution keeps the CLI/git-hook flow simple: hooks read
// the project name from project.yaml and never need to know the UUID.
const createEventBaseSchema = z.object({
  project_id: z.string().uuid().optional(),
  project_name: z.string().min(1).optional(),
  prd_id: z.string().uuid().optional().nullable(),
  pull_request_id: z.string().uuid().optional().nullable(),
  type: eventTypeEnum,
  // Optional: when omitted/empty the API backfills a title from the event type.
  title: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  occurred_at: z.string().datetime(),
})

export const createEventSchema = createEventBaseSchema.refine(
  (d) => Boolean(d.project_id) || Boolean(d.project_name),
  { message: "Either project_id or project_name is required", path: ["project_id"] },
)

export const eventResponseSchema = createEventBaseSchema.extend({
  project_id: z.string().uuid(),
  title: z.string(),
  id: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const eventListQuerySchema = paginationQuerySchema.extend({
  project_id: z.string().uuid().optional(),
  domain: z.string().optional(),
  type: eventTypeEnum.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
})

export const eventSummaryResponseSchema = z.object({
  total: z.number(),
  by_type: z.record(eventTypeEnum, z.number()),
  recent: z.array(eventResponseSchema),
})

// ---------------------------------------------------------------------------
// Aggregated status (GET /api/v1/status/all)
//
// A single machine-readable surface describing every registered project, built
// for automated consumers (e.g. the reveille morning-brief collector) rather
// than a human dashboard. The shape is intentionally flat and stable.
// ---------------------------------------------------------------------------

// Quick-triage lifecycle state for a project, derived from its PRDs and PRs:
//   building   — an in_progress PRD exists (work is actively in flight)
//   reviewing  — no active PRD, but there are open pull requests
//   planned    — queued PRD(s) exist, nothing in progress and no open PRs
//   idle       — nothing in progress, queued, or open
export const sdlcStateEnum = z.enum(["building", "reviewing", "planned", "idle"])

// Staleness bucket derived from days since the last recorded activity:
//   active — < 1 day    recent — < 7 days    aging — < 14 days    stale — >= 14 days or never
export const stalenessEnum = z.enum(["active", "recent", "aging", "stale"])

export const statusOpenPrSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  status: pullRequestStatusEnum,
  check_status: checkStatusEnum.nullable(),
  author: z.string(),
  opened_at: z.string().datetime(),
})

export const statusActivePrdSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  summary: z.string().nullable(),
  source_path: z.string().nullable(),
  status: prdStatusEnum,
  work_items_total: z.number().int(),
  work_items_done: z.number().int(),
  progress: z.number().min(0).max(1),
})

export const statusLastEventSchema = z.object({
  type: eventTypeEnum,
  title: z.string(),
  occurred_at: z.string().datetime(),
})

export const projectStatusSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  domain: z.string().nullable(),
  workflow: z.string(),
  repo_path: z.string().nullable(),
  repo_url: z.string().nullable(),
  main_branch: z.string(),
  sdlc_state: sdlcStateEnum,
  staleness: stalenessEnum,
  last_activity_at: z.string().datetime().nullable(),
  days_since_activity: z.number().int().nullable(),
  last_event: statusLastEventSchema.nullable(),
  active_prd: statusActivePrdSchema.nullable(),
  prd_counts: z.object({
    queued: z.number().int(),
    in_progress: z.number().int(),
    completed: z.number().int(),
  }),
  open_prs: z.object({
    count: z.number().int(),
    items: z.array(statusOpenPrSchema),
  }),
})

export const statusAllResponseSchema = z.object({
  generated_at: z.string().datetime(),
  project_count: z.number().int(),
  projects: z.array(projectStatusSchema),
})

export type ProjectStatus = z.infer<typeof projectStatusSchema>
export type StatusAllResponse = z.infer<typeof statusAllResponseSchema>
