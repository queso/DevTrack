import { apiSuccess } from "@/lib/api/response"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/db"
import type { PullRequestStatus } from "@/lib/generated/prisma/client"
import {
  type ProjectStatus,
  type ReveilleStatusResponse,
  reveilleStatusResponseSchema,
  statusAllResponseSchema,
  type StatusAllResponse,
} from "@/lib/schemas"

// PR statuses that count as "still open work" — everything except merged/closed.
const OPEN_PR_STATUSES: PullRequestStatus[] = [
  "open",
  "draft",
  "review_requested",
  "changes_requested",
  "approved",
]

const DAY_MS = 24 * 60 * 60 * 1000

function stalenessFor(days: number | null): ProjectStatus["staleness"] {
  if (days === null) return "stale"
  if (days < 1) return "active"
  if (days < 7) return "recent"
  if (days < 14) return "aging"
  return "stale"
}

// --- reveille collector mapping (?format=reveille) ---------------------------

// Derive a "business/repo" slug (e.g. "queso/content") from the repo URL, so the
// reveille brief labels projects the way a human names them. Falls back to name.
function repoSlug(p: ProjectStatus): string {
  if (p.repo_url) {
    const m = p.repo_url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/)
    if (m) return m[1]
  }
  return p.name
}

// Map DevTrack's sdlc_state onto reveille's enum
// (idle | planning | building | reviewing | shipped). "shipped" is surfaced when
// a project just completed work and has nothing new in flight.
function reveilleState(p: ProjectStatus): ReveilleStatusResponse["projects"][number]["sdlc_state"] {
  switch (p.sdlc_state) {
    case "building":
      return "building"
    case "reviewing":
      return "reviewing"
    case "planned":
      return "planning"
    default:
      if (p.prd_counts.completed > 0 && (p.staleness === "active" || p.staleness === "recent")) {
        return "shipped"
      }
      return "idle"
  }
}

// Human-readable blockers that feed the brief's "Decisions needed" slot.
function blockersFor(p: ProjectStatus): string[] {
  const blockers: string[] = []
  for (const pr of p.open_prs.items) {
    if (pr.check_status === "failing") {
      blockers.push(`PR #${pr.number} checks failing: ${pr.title}`)
    } else if (pr.status === "review_requested") {
      blockers.push(`PR #${pr.number} awaiting review: ${pr.title}`)
    } else if (pr.status === "changes_requested") {
      blockers.push(`PR #${pr.number} needs changes: ${pr.title}`)
    }
  }
  if (p.sdlc_state === "building" && (p.staleness === "aging" || p.staleness === "stale")) {
    const title = p.active_prd?.title ?? "active PRD"
    blockers.push(`"${title}" stalled — no activity in ${p.days_since_activity ?? "?"}d`)
  }
  return blockers
}

function toReveille(projectStatuses: ProjectStatus[], nowMs: number): ReveilleStatusResponse {
  return {
    collector: "devtrack",
    ok: true,
    generated_at: new Date(nowMs).toISOString(),
    projects: projectStatuses.map((p) => {
      const blockers = blockersFor(p)
      return {
        project: repoSlug(p),
        sdlc_state: reveilleState(p),
        ...(p.active_prd ? { active_prd: p.active_prd.title } : {}),
        open_prs: p.open_prs.items.map((pr) => ({
          number: pr.number,
          title: pr.title,
          url: pr.url,
          age_days: Math.max(0, Math.round((nowMs - Date.parse(pr.opened_at)) / DAY_MS)),
        })),
        ...(blockers.length > 0 ? { blockers } : {}),
      }
    }),
  }
}

/**
 * GET /api/v1/status/all
 *
 * Aggregated, machine-readable status for every registered project. Built for
 * automated consumers (the reveille morning-brief collector), not the human
 * dashboard. Response shape is validated against `statusAllResponseSchema`.
 */
export async function GET(request: Request) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const now = Date.now()

  const projects = await prisma.project.findMany({
    orderBy: { name: "asc" },
    include: {
      prds: { include: { workItems: true } },
      pullRequests: {
        where: { status: { in: OPEN_PR_STATUSES } },
        orderBy: { openedAt: "desc" },
      },
      events: { orderBy: { occurredAt: "desc" }, take: 1 },
    },
  })

  const projectStatuses: ProjectStatus[] = projects.map((project) => {
    const activePrd = project.prds.find((p) => p.status === "in_progress") ?? null
    const prdCounts = {
      queued: project.prds.filter((p) => p.status === "queued").length,
      in_progress: project.prds.filter((p) => p.status === "in_progress").length,
      completed: project.prds.filter((p) => p.status === "completed").length,
    }

    const openPrs = project.pullRequests
    const sdlcState: ProjectStatus["sdlc_state"] = activePrd
      ? "building"
      : openPrs.length > 0
        ? "reviewing"
        : prdCounts.queued > 0
          ? "planned"
          : "idle"

    // Effective last-activity = most recent of the stored marker and the latest
    // recorded event, so staleness is correct even for events posted before the
    // project marker was bumped.
    const latestEvent = project.events[0] ?? null
    const candidateTimes = [
      project.lastActivityAt?.getTime(),
      latestEvent?.occurredAt.getTime(),
    ].filter((t): t is number => typeof t === "number")
    const lastActivityMs = candidateTimes.length > 0 ? Math.max(...candidateTimes) : null

    const daysSinceActivity =
      lastActivityMs === null ? null : Math.floor((now - lastActivityMs) / DAY_MS)

    const workItemsTotal = activePrd?.workItems.length ?? 0
    const workItemsDone = activePrd?.workItems.filter((wi) => wi.status === "done").length ?? 0

    return {
      id: project.id,
      name: project.name,
      domain: project.domain,
      workflow: project.workflow,
      repo_path: project.repoPath,
      repo_url: project.repoUrl,
      main_branch: project.mainBranch,
      sdlc_state: sdlcState,
      staleness: stalenessFor(daysSinceActivity),
      last_activity_at: lastActivityMs === null ? null : new Date(lastActivityMs).toISOString(),
      days_since_activity: daysSinceActivity,
      last_event: latestEvent
        ? {
            type: latestEvent.type,
            title: latestEvent.title,
            occurred_at: latestEvent.occurredAt.toISOString(),
          }
        : null,
      active_prd: activePrd
        ? {
            id: activePrd.id,
            title: activePrd.title,
            summary: activePrd.summary,
            source_path: activePrd.sourcePath,
            status: activePrd.status,
            work_items_total: workItemsTotal,
            work_items_done: workItemsDone,
            progress:
              workItemsTotal === 0 ? 0 : Math.round((workItemsDone / workItemsTotal) * 100) / 100,
          }
        : null,
      prd_counts: prdCounts,
      open_prs: {
        count: openPrs.length,
        items: openPrs.map((pr) => ({
          number: pr.number,
          title: pr.title,
          url: pr.url,
          status: pr.status,
          check_status: pr.checkStatus,
          author: pr.author,
          opened_at: pr.openedAt.toISOString(),
        })),
      },
    }
  })

  // `?format=reveille` emits the reveille collector shape as a BARE object (no
  // envelope), so a snapshot of the response is directly a valid devtrack.json.
  const format = new URL(request.url).searchParams.get("format")
  if (format === "reveille") {
    const reveille = reveilleStatusResponseSchema.parse(toReveille(projectStatuses, now))
    return Response.json(reveille)
  }

  const payload: StatusAllResponse = statusAllResponseSchema.parse({
    generated_at: new Date(now).toISOString(),
    project_count: projectStatuses.length,
    projects: projectStatuses,
  })

  return Response.json(apiSuccess(payload))
}
