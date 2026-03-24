import type {
  CheckStatus as UiCheckStatus,
  PRD as UiPRD,
  Project as UiProject,
  PullRequest as UiPullRequest,
  TimelineEvent as UiTimelineEvent,
  WorkItem as UiWorkItem,
} from "@/lib/ui-types"
import type { ApiEvent, ApiProject, ApiPullRequest } from "@/types/api-responses"
import type { WorkItem as ApiWorkItem, Prd } from "@/types/prd"

// ---------------------------------------------------------------------------
// mapWorkItem
// ---------------------------------------------------------------------------

export function mapWorkItem(item: ApiWorkItem): UiWorkItem {
  return {
    id: item.id,
    title: item.title,
    status: item.status === "in_progress" ? "in-progress" : item.status,
  }
}

// ---------------------------------------------------------------------------
// mapPR
// ---------------------------------------------------------------------------

function mapPRStatus(status: string): UiPullRequest["status"] {
  switch (status) {
    case "changes_requested":
      return "changes-requested"
    case "review_requested":
      return "open"
    default:
      return status as UiPullRequest["status"]
  }
}

function toISOString(value: Date | string): string {
  if (typeof value === "string") return value
  return value.toISOString()
}

// JSON deserialization returns dates as strings. Coerce to Date so .getTime() works.
function toDate(value: Date | string | null): Date | null {
  if (value == null) return null
  if (typeof value === "string") return new Date(value)
  return value
}

export function mapPR(pr: ApiPullRequest, projectSlug: string): UiPullRequest {
  return {
    id: pr.id,
    projectSlug,
    number: pr.number,
    title: pr.title,
    branch: pr.branch_id ?? "",
    status: mapPRStatus(pr.status),
    checkStatus: pr.check_status ?? "pending",
    createdAt: toISOString(pr.opened_at),
    url: pr.url,
    author: pr.author,
    unresolvedComments: pr.unresolved_comments ?? 0,
  }
}

// ---------------------------------------------------------------------------
// mapTimelineEvent
// ---------------------------------------------------------------------------

function mapEventType(type: string): UiTimelineEvent["type"] {
  switch (type) {
    case "pr_opened":
      return "pr-opened"
    case "pr_merged":
      return "pr-merged"
    case "pr_approved":
      return "pr-reviewed"
    case "prd_updated":
      return "prd-update"
    default:
      return type as UiTimelineEvent["type"]
  }
}

export function mapTimelineEvent(event: ApiEvent, projectSlug: string): UiTimelineEvent {
  return {
    id: event.id,
    projectSlug,
    type: mapEventType(event.type),
    description: event.title,
    timestamp: toISOString(event.occurredAt),
    metadata: event.metadata as Record<string, string>,
  }
}

// ---------------------------------------------------------------------------
// mapProject
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

function computeActivityLevel(lastActivityAt: Date | null): UiProject["activityLevel"] {
  if (!lastActivityAt) return "stale"
  const age = Date.now() - lastActivityAt.getTime()
  if (age < HOUR) return "active-now"
  if (age < DAY) return "today"
  if (age < WEEK) return "this-week"
  return "stale"
}

function computeDaysSinceActivity(lastActivityAt: Date | null): number {
  if (!lastActivityAt) return 999
  return Math.floor((Date.now() - lastActivityAt.getTime()) / DAY)
}

interface ApiPrdWithItems extends Prd {
  workItems: ApiWorkItem[]
}

function mapPRD(prd: ApiPrdWithItems, uiStatus: UiPRD["status"]): UiPRD {
  return {
    id: prd.id,
    title: prd.title,
    summary: prd.summary ?? "",
    status: uiStatus,
    workItems: prd.workItems.map(mapWorkItem),
  }
}

function computeActionNeeded(project: ApiProject): boolean {
  const lastActivityAt = toDate(project.lastActivityAt)
  if (!lastActivityAt || Date.now() - lastActivityAt.getTime() >= WEEK) {
    return true
  }
  for (const pr of project.pullRequests) {
    if (pr.status === "review_requested") return true
    if (pr.check_status === "failing") return true
    if (pr.status === "changes_requested") return true
  }
  return false
}

function computeCheckStatus(pullRequests: ApiPullRequest[]): UiCheckStatus {
  const open = pullRequests.filter(
    (pr) => pr.status === "open" || pr.status === "draft" || pr.status === "review_requested",
  )
  if (open.length === 0) return "passing"
  if (open.some((pr) => pr.check_status === "failing")) return "failing"
  if (open.some((pr) => pr.check_status === "pending" || pr.check_status == null)) return "pending"
  return "passing"
}

function computeOpenPRCount(pullRequests: ApiPullRequest[]): number {
  return pullRequests.filter(
    (pr) => pr.status === "open" || pr.status === "draft" || pr.status === "review_requested",
  ).length
}

function buildSdlcSummaryLine(project: ApiProject, lastActivityAt: Date | null): string {
  const activePrd = project.prds.find((p) => p.status === "in_progress")
  if (activePrd) {
    const total = activePrd.workItems.length
    const done = activePrd.workItems.filter((wi) => wi.status === "done").length
    if (total > 0) {
      return `${activePrd.title} — ${done}/${total} items done`
    }
    return activePrd.title
  }

  const activityLevel = computeActivityLevel(lastActivityAt)
  if (activityLevel === "stale") {
    const days = computeDaysSinceActivity(lastActivityAt)
    return `No active PRD — stale for ${days} day${days !== 1 ? "s" : ""}`
  }

  const queued = project.prds.find((p) => p.status === "queued")
  if (queued) {
    return `Up next: ${queued.title}`
  }

  return "No active PRD"
}

export function mapProject(project: ApiProject): UiProject {
  // Coerce lastActivityAt — JSON responses deliver it as a string, not a Date.
  const lastActivityAt = toDate(project.lastActivityAt)
  const projectWithDate = { ...project, lastActivityAt }

  const activityLevel = computeActivityLevel(lastActivityAt)
  const daysSinceActivity = computeDaysSinceActivity(lastActivityAt)
  const actionNeeded = computeActionNeeded(projectWithDate)
  const checkStatus = computeCheckStatus(project.pullRequests)
  const openPRCount = computeOpenPRCount(project.pullRequests)

  const activePrd = project.prds.find((p) => p.status === "in_progress")
  const upNextPrds = project.prds.filter((p) => p.status === "queued")
  const shippedPrds = project.prds.filter((p) => p.status === "completed")

  const summaryLine = buildSdlcSummaryLine(project, lastActivityAt)

  return {
    slug: project.name,
    name: project.name,
    domain: (project.domain ?? "") as UiProject["domain"],
    workflow: project.workflow,
    tags: project.tags,
    activityLevel,
    repoUrl: project.repoUrl ?? "",
    deployUrl: project.deployUrl ?? undefined,
    openPRCount,
    checkStatus,
    daysSinceActivity,
    actionNeeded,
    summaryLine,
    activePRD: activePrd ? mapPRD(activePrd, "active") : undefined,
    upNextPRDs: upNextPrds.map((p) => mapPRD(p, "queued")),
    shippedPRDs: shippedPrds.map((p) => mapPRD(p, "shipped")),
  }
}
