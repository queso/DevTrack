"use client"

/**
 * WI-633: Project summary page client component.
 *
 * Renders the full project detail view wired to live API data via SWR hooks.
 */

import { useState, useRef } from "react"
import { useProject, useTimeline } from "@/lib/hooks"
import { mapProject, mapTimelineEvent, mapPR } from "@/lib/mappers"
import {
  ProjectDetailHeaderSkeleton,
  TimelineEntrySkeleton,
  ErrorState,
} from "@/components/features/dashboard/loading-states"

interface ProjectPageClientProps {
  slug: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCheckStatusColor(status: string): string {
  if (status === "failing") return "text-red-500"
  if (status === "pending") return "text-yellow-500"
  return "text-green-500"
}

function getWorkItemStatusLabel(status: string): string {
  if (status === "done") return "done"
  if (status === "in-progress") return "in progress"
  return "pending"
}

// ---------------------------------------------------------------------------
// Event type options for filter
// ---------------------------------------------------------------------------

const EVENT_TYPE_OPTIONS: { label: string; value: string | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Pull Requests", value: "pr_opened" },
  { label: "Work Items", value: "prd_updated" },
  { label: "Deployments", value: "deploy" },
]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ProjectPageClient({ slug }: ProjectPageClientProps) {
  const [page, setPage] = useState(1)
  const [eventType, setEventType] = useState<string | undefined>(undefined)
  // Ref-based accumulation of timeline events across pages.
  // Keyed by page+eventType so we can detect when to reset vs. append.
  const accumulatedRef = useRef<{
    page: number
    eventType: string | undefined
    events: import("@/types/api-responses").ApiEvent[]
  }>({ page: 1, eventType: undefined, events: [] })

  const {
    data: rawProject,
    error: projectError,
    isLoading: projectLoading,
  } = useProject(slug, {})

  // Only fetch timeline once we have the real project id. Passing null to
  // useTimeline defers the fetch (SWR skips null keys).
  const projectId = rawProject?.id ?? null

  const {
    data: rawTimeline,
    error: timelineError,
    isLoading: timelineLoading,
    meta: timelineMeta,
  } = useTimeline(
    projectId != null
      ? {
          projectId,
          page,
          ...(eventType ? { eventType } : {}),
        }
      : undefined,
    {},
  )

  // Accumulate timeline pages inline (during render) using a ref so we don't
  // need an extra useEffect + state update cycle. When page/eventType change
  // we reset; otherwise we append the new page's events to the prior list.
  if (rawTimeline) {
    const prev = accumulatedRef.current
    if (page === 1 || prev.eventType !== eventType) {
      // Filter reset or first page — start fresh
      accumulatedRef.current = { page, eventType, events: rawTimeline }
    } else if (prev.page !== page) {
      // Advancing a page — append without duplicating
      accumulatedRef.current = {
        page,
        eventType,
        events: [...prev.events, ...rawTimeline],
      }
    }
  }

  const accumulatedEvents = rawTimeline ? accumulatedRef.current.events : []

  // --- Project error state ---
  if (projectError) {
    const is404 = (projectError as Error & { status?: number }).status === 404
    if (is404) {
      return (
        <div className="p-8">
          <p>Project not found (404) — does not exist.</p>
        </div>
      )
    }
    return (
      <ErrorState
        message={projectError.message}
        onRetry={() => window.location.reload()}
      />
    )
  }

  // --- Project loading state ---
  if (projectLoading) {
    return (
      <div className="p-8 flex flex-col gap-8">
        <ProjectDetailHeaderSkeleton />
        <ProjectDetailHeaderSkeleton />
        <TimelineEntrySkeleton />
        <TimelineEntrySkeleton />
      </div>
    )
  }

  if (!rawProject) return null

  // Map project data
  const project = mapProject(rawProject)

  // Map timeline events — use accumulated list so "Load more" appends rather than replaces.
  const timelineEvents = accumulatedEvents.map((e) =>
    mapTimelineEvent(e, slug)
  )

  // Map pull requests from raw project
  const rawPRs = rawProject.pullRequests ?? []
  const pullRequests = rawPRs.map((pr) =>
    mapPR(pr, slug)
  )

  // Compute health indicators
  const openPRCount = project.openPRCount
  const checkStatus = project.checkStatus
  const actionNeeded = project.actionNeeded

  // Progress computation from active PRD
  const activePRD = project.activePRD
  const workItems = activePRD?.workItems ?? []
  const totalItems = workItems.length
  const doneItems = workItems.filter((wi) => wi.status === "done").length
  const progressPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0

  // Load more pagination
  const hasMore =
    timelineMeta != null &&
    timelineMeta.total > timelineMeta.page * timelineMeta.per_page

  function handleLoadMore() {
    setPage((p) => p + 1)
  }

  function handleEventTypeChange(value: string | undefined) {
    setEventType(value)
    setPage(1)
  }

  return (
    <div className="p-8 flex flex-col gap-8">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">{project.name}</h1>

        <div className="flex gap-3 items-center flex-wrap">
          {/* Repo link */}
          {project.repoUrl && (
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <svg
                role="img"
                aria-label="GitHub"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="currentColor"
              >
                <title>GitHub</title>
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12" />
              </svg>
              <span>GitHub</span>
            </a>
          )}

          {/* Deploy link */}
          {project.deployUrl && (
            <a
              href={project.deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Deploy link"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Deploy
            </a>
          )}

          {/* Open PR count */}
          <span className="text-sm text-muted-foreground">
            {openPRCount} open PR{openPRCount !== 1 ? "s" : ""}
          </span>

          {/* Check status */}
          <span className={`text-sm font-medium ${getCheckStatusColor(checkStatus)}`}>
            {checkStatus === "failing" ? "Failing" : checkStatus === "pending" ? "Pending" : "Passing"}
          </span>

          {/* Action needed */}
          {actionNeeded && (
            <span className="text-sm font-semibold text-orange-500">
              Action Needed
            </span>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Current Work (SDLC)                                                  */}
      {/* ------------------------------------------------------------------ */}
      {project.workflow === "sdlc" && activePRD && (
        <section aria-label="Current Work">
          <h2 className="text-lg font-semibold mb-3">Current Work</h2>

          {/* Active PRD */}
          <section
            aria-label={`Active PRD: ${activePRD.title}`}
            className="border border-border rounded-lg p-4 flex flex-col gap-3"
          >
            {/* Progress bar */}
            {totalItems > 0 && (
              <div>
                <div
                  role="progressbar"
                  aria-valuenow={progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="h-2 rounded-full bg-muted overflow-hidden"
                >
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {doneItems}/{totalItems} done
                </p>
              </div>
            )}

            {/* Work items */}
            <ul className="flex flex-col gap-1">
              {workItems.map((wi) => (
                <li key={wi.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={
                      wi.status === "done"
                        ? "text-green-500"
                        : wi.status === "in-progress"
                        ? "text-blue-500"
                        : "text-muted-foreground"
                    }
                  >
                    {getWorkItemStatusLabel(wi.status)}
                  </span>
                  <span>{wi.title}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Branch and PR info — PR number/title exposed via aria-label only */}
          {pullRequests.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {pullRequests.map((pr) => (
                <div key={pr.id} className="flex flex-col gap-1 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">
                    {pr.branch}
                  </span>
                  <div className="flex items-center gap-2">
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline font-medium"
                    >
                      #{pr.number}
                    </a>
                    {pr.title && (
                      <span className="text-sm text-muted-foreground truncate">{pr.title}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Pipeline — SDLC variant                                              */}
      {/* ------------------------------------------------------------------ */}
      {project.workflow === "sdlc" && (
        <section aria-label="Pipeline">
          <h2 className="text-lg font-semibold mb-3">Pipeline</h2>

          {/* Up Next */}
          {(project.upNextPRDs ?? []).length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Up Next</h3>
              <ul className="flex flex-col gap-2">
                {(project.upNextPRDs ?? []).map((prd) => (
                  <li key={prd.id} className="border border-border rounded p-3">
                    <p className="font-medium text-sm">{prd.title}</p>
                    {prd.summary && (
                      <p className="text-xs text-muted-foreground mt-1">{prd.summary}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Shipped */}
          {(project.shippedPRDs ?? []).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Shipped</h3>
              <ul className="flex flex-col gap-2">
                {(project.shippedPRDs ?? []).map((prd) => (
                  <li key={prd.id} className="border border-border rounded p-3">
                    <p className="font-medium text-sm">{prd.title}</p>
                    {prd.summary && (
                      <p className="text-xs text-muted-foreground mt-1">{prd.summary}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}


      {/* ------------------------------------------------------------------ */}
      {/* Activity Timeline                                                     */}
      {/* ------------------------------------------------------------------ */}
      <section aria-label="Activity Timeline">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Activity</h2>

          {/* Event type filter */}
          <fieldset
            aria-label="Filter by event type"
            className="flex gap-1 border-0 p-0 m-0"
          >
            {EVENT_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => handleEventTypeChange(opt.value)}
                aria-pressed={eventType === opt.value}
                className={`px-2 py-1 text-xs rounded border ${
                  eventType === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </fieldset>
        </div>

        {/* Timeline loading */}
        {timelineLoading && (
          <div className="flex flex-col gap-3">
            <TimelineEntrySkeleton />
            <TimelineEntrySkeleton />
          </div>
        )}

        {/* Timeline error */}
        {timelineError && !timelineLoading && (
          <ErrorState
            message={timelineError.message}
            onRetry={() => {
              setPage(1)
              setEventType(undefined)
            }}
          />
        )}

        {/* Timeline events */}
        {!timelineLoading && !timelineError && (
          <ul className="flex flex-col gap-3">
            {timelineEvents.map((event) => (
              <li key={event.id} className="flex items-start gap-3 text-sm">
                <span className="text-xs font-mono text-muted-foreground uppercase shrink-0">
                  {event.type}
                </span>
                <span>{event.description}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Load more */}
        {!timelineLoading && hasMore && (
          <button
            type="button"
            onClick={handleLoadMore}
            className="mt-4 px-4 py-2 text-sm rounded border border-border hover:bg-muted"
          >
            Load more
          </button>
        )}
      </section>
    </div>
  )
}

export default ProjectPageClient
