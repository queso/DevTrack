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

const workflowEnum = z.enum(["sdlc", "content"])
const prdStatusEnum = z.enum(["queued", "in_progress", "completed"])
const workItemStatusEnum = z.enum(["todo", "in_progress", "done"])
const contentItemStatusEnum = z.enum(["idea", "draft", "published"])
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
  "content_published",
  "commit",
])

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export const createProjectSchema = z.object({
  name: z.string().min(1),
  workflow: workflowEnum,
  domain: z.string().optional(),
  owner: z.string().optional(),
  tags: z.array(z.string()).default([]),
  repo_url: z.string().url().optional(),
  main_branch: z.string().default("main"),
  branch_prefix: z.string().optional(),
  prd_path: z.string().optional(),
  test_pattern: z.string().optional(),
  content_path: z.string().optional(),
  draft_path: z.string().optional(),
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
  workflow: workflowEnum.optional(),
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
// ContentItem
// ---------------------------------------------------------------------------

export const createContentSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string().optional(),
  status: contentItemStatusEnum.default("idea"),
  source_path: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
  published_at: z.string().datetime().optional().nullable(),
})

export const updateContentSchema = createContentSchema.partial()

export const contentResponseSchema = createContentSchema.extend({
  id: z.string().uuid(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const contentListQuerySchema = paginationQuerySchema.extend({
  status: contentItemStatusEnum.optional(),
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

export const createEventSchema = z.object({
  project_id: z.string().uuid(),
  prd_id: z.string().uuid().optional().nullable(),
  pull_request_id: z.string().uuid().optional().nullable(),
  type: eventTypeEnum,
  title: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
  occurred_at: z.string().datetime(),
})

export const eventResponseSchema = createEventSchema.extend({
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
