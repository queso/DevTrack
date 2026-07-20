"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { EmptyState, TimelineEntrySkeleton } from "@/components/features/dashboard/loading-states"
import type { Domain } from "@/lib/constants"
import { DOMAIN_LABELS, DOMAIN_ORDER } from "@/lib/constants"
import { useProjects, useTimeline } from "@/lib/hooks"
import { mapTimelineEvent } from "@/lib/mappers"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type QuickRange = "today" | "yesterday" | "week" | "all"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDayLabel(timestamp: string): string {
  const d = new Date(timestamp)
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const yesterday = new Date(today.getTime() - 86400000)
  const eventDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

  if (eventDay.getTime() === today.getTime()) return "Today"
  if (eventDay.getTime() === yesterday.getTime()) return "Yesterday"

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ]
  const diff = today.getTime() - eventDay.getTime()
  if (diff < 7 * 86400000) return days[eventDay.getUTCDay()]
  return `${days[eventDay.getUTCDay()]}, ${months[eventDay.getUTCMonth()]} ${eventDay.getUTCDate()}`
}

function buildDaySummary(events: { type: string; projectSlug: string }[]): string {
  const commits = events.filter((e) => e.type === "commit")
  const commitProjects = new Set(commits.map((e) => e.projectSlug)).size
  const prMerged = events.filter((e) => e.type === "pr-merged" || e.type === "pr_merged").length
  const prdCompleted = events.filter(
    (e) => e.type === "prd-update" || e.type === "prd_completed",
  ).length

  const parts: string[] = []
  if (commits.length > 0) {
    parts.push(
      `${commits.length} ${commits.length === 1 ? "commit" : "commits"} across ${commitProjects} ${commitProjects === 1 ? "project" : "projects"}`,
    )
  }
  if (prMerged > 0) {
    parts.push(`${prMerged} ${prMerged === 1 ? "PR" : "PRs"} merged`)
  }
  if (prdCompleted > 0) {
    parts.push(`${prdCompleted} ${prdCompleted === 1 ? "PRD" : "PRDs"} completed`)
  }
  return parts.length > 0
    ? parts.join(", ")
    : `${events.length} event${events.length !== 1 ? "s" : ""}`
}

function buildUrl(
  base: string,
  params: Record<string, string | null | undefined>,
  searchParams: URLSearchParams,
): string {
  const next = new URLSearchParams(searchParams.toString())
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === "") {
      next.delete(k)
    } else {
      next.set(k, v)
    }
  }
  const qs = next.toString()
  return qs ? `${base}?${qs}` : base
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOMAINS: Domain[] = [...DOMAIN_ORDER]

// Event-type filter options use the raw API event-type values so the selection
// can be pushed to the server (`?type=`) instead of filtering a single fetched
// page client-side. "All types" omits tool_use (see DEFAULT_EXCLUDED_TYPES).
const EVENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "commit", label: "Commits" },
  { value: "push", label: "Pushes" },
  { value: "merge", label: "Merges" },
  { value: "pr_opened", label: "PRs opened" },
  { value: "pr_merged", label: "PRs merged" },
  { value: "prd_updated", label: "PRD updates" },
  { value: "session_start", label: "Session starts" },
  { value: "session_end", label: "Session ends" },
  { value: "turn_end", label: "Turns" },
  { value: "tool_use", label: "Tool use" },
]

// The tool_use firehose (one event per Bash command, box-wide) drowns out real
// SDLC activity, so the default "All types" view excludes it. Selecting "Tool
// use" explicitly still shows it.
const DEFAULT_EXCLUDED_TYPES = "tool_use"

// Timeline page size. Large enough that a week of real (non-tool_use) activity
// lands in one fetch for most projects.
const TIMELINE_PAGE_SIZE = 100

// rangeToBounds converts a quick-range selection into ISO `from`/`to` bounds
// (UTC day boundaries) for the server query. "all" returns no bounds.
function rangeToBounds(range: QuickRange): { from?: string; to?: string } {
  if (range === "all") return {}
  const now = new Date()
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dayMs = 86400000
  if (range === "today") return { from: todayStart.toISOString() }
  if (range === "yesterday") {
    return {
      from: new Date(todayStart.getTime() - dayMs).toISOString(),
      to: todayStart.toISOString(),
    }
  }
  return { from: new Date(todayStart.getTime() - 7 * dayMs).toISOString() }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TimelinePageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = "/timeline"

  // Read filter state from URL
  const rangeParam = (searchParams.get("range") ?? "week") as QuickRange
  const projectParam = searchParams.get("project") ?? "all"
  const domainParam = (searchParams.get("domain") ?? "all") as Domain | "all"
  const typeParam = searchParams.get("type") ?? "all"
  const pageParam = Number(searchParams.get("page") ?? "1")

  // Local filter state (mirrors URL)
  const [quickRange, setQuickRange] = useState<QuickRange>(rangeParam)
  const [projectFilter, setProjectFilter] = useState<string>(projectParam)
  const [domainFilter, setDomainFilter] = useState<Domain | "all">(domainParam)
  const [eventTypeFilter, setEventTypeFilter] = useState<string>(typeParam)
  const [page, setPage] = useState<number>(pageParam)

  const { data: rawProjects } = useProjects()

  const projects = useMemo(() => rawProjects ?? [], [rawProjects])

  // Resolve the project name in the filter to its id for the server query.
  const projectId = useMemo(() => {
    if (projectFilter === "all") return undefined
    return projects.find((p) => p.name === projectFilter)?.id
  }, [projectFilter, projects])

  // All filtering happens server-side so the query sees the whole dataset, not
  // just one fetched page — the previous client-side filtering could only ever
  // match within the ~20 most recent events, which the tool_use firehose filled.
  const bounds = rangeToBounds(quickRange)
  const {
    data: rawEvents,
    meta,
    isLoading,
    error,
    mutate,
  } = useTimeline({
    projectId,
    domain: domainFilter === "all" ? undefined : domainFilter,
    eventType: eventTypeFilter === "all" ? undefined : eventTypeFilter,
    excludeType: eventTypeFilter === "all" ? DEFAULT_EXCLUDED_TYPES : undefined,
    from: bounds.from,
    to: bounds.to,
    page,
    limit: TIMELINE_PAGE_SIZE,
  })

  // Map events (already server-filtered) for rendering.
  const events = useMemo(() => {
    if (!rawEvents) return []
    return rawEvents.map((e) => {
      const project = projects.find((p) => p.id === e.projectId)
      return mapTimelineEvent(e, project?.name ?? e.projectId)
    })
  }, [rawEvents, projects])

  // Group by day
  const grouped = useMemo(() => {
    const map = new Map<string, typeof events>()
    for (const e of events) {
      const key = getDayLabel(e.timestamp)
      if (!map.has(key)) map.set(key, [])
      map.get(key)?.push(e)
    }
    return map
  }, [events])

  // Navigation helpers
  function navigate(overrides: Record<string, string | null>) {
    const url = buildUrl(pathname, overrides, searchParams)
    router.replace(url)
  }

  function handleRangeChange(range: QuickRange) {
    setQuickRange(range)
    setPage(1)
    navigate({ range, page: null })
  }

  function handleProjectFilter(value: string) {
    setProjectFilter(value)
    setPage(1)
    navigate({ project: value === "all" ? null : value, page: null })
  }

  function handleDomainFilter(value: Domain | "all") {
    setDomainFilter(value)
    setPage(1)
    navigate({ domain: value === "all" ? null : value, page: null })
  }

  function handleEventTypeFilter(value: string) {
    setEventTypeFilter(value)
    setPage(1)
    navigate({ type: value === "all" ? null : value, page: null })
  }

  function handleLoadMore() {
    const next = page + 1
    setPage(next)
    navigate({ page: String(next) })
  }

  // Determine if "load more" should show
  // Show when there is a next page: page * per_page < total
  const hasMore = meta !== undefined && meta.total > 0 && meta.page * meta.per_page < meta.total

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Timeline</h1>
          <p className="text-sm text-muted-foreground mt-1">Cross-project activity feed</p>
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
            <TimelineEntrySkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6 p-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Timeline</h1>
        </div>
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <p className="text-muted-foreground">Failed to load timeline: {error.message}</p>
          <button
            type="button"
            onClick={() => mutate()}
            className="mt-2 px-4 py-2 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Timeline</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cross-project activity feed for standups and recaps
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        {/* Date range quick buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {(["today", "yesterday", "week", "all"] as QuickRange[]).map((r) => {
            const label =
              r === "today"
                ? "Today"
                : r === "yesterday"
                  ? "Yesterday"
                  : r === "week"
                    ? "This week"
                    : "All time"
            return (
              <button
                type="button"
                key={r}
                onClick={() => handleRangeChange(r)}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                  quickRange === r
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                )}
              >
                {label}
              </button>
            )
          })}
          <input
            type="text"
            aria-label="From date"
            placeholder="From"
            className="sr-only"
            readOnly
          />
        </div>

        {/* Domain + Project + Event type row */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Domain filter */}
          <select
            aria-label="domain"
            value={domainFilter}
            onChange={(e) => handleDomainFilter(e.target.value as Domain | "all")}
            className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Domains</option>
            {DOMAINS.map((d) => (
              <option key={d} value={d}>
                {DOMAIN_LABELS[d]}
              </option>
            ))}
          </select>

          {/* Project filter */}
          <select
            aria-label="project"
            value={projectFilter}
            onChange={(e) => handleProjectFilter(e.target.value)}
            className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Event type filter */}
          <select
            aria-label="event type"
            value={eventTypeFilter}
            onChange={(e) => handleEventTypeFilter(e.target.value)}
            className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All (excl. tool use)</option>
            {EVENT_TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Timeline content */}
      {events.length === 0 ? (
        <EmptyState message="No events match your filters." />
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(grouped.entries()).map(([day, dayEvents]) => (
            <section key={day} aria-label={day} className="flex flex-col gap-3">
              {/* Day header */}
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-foreground">{day}</h2>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Day summary */}
              <div className="rounded-md bg-muted/30 border border-border/50 px-3 py-2 text-xs text-muted-foreground">
                {buildDaySummary(dayEvents)}
              </div>

              {/* Events */}
              <div className="relative flex flex-col gap-0">
                <div className="absolute left-3.5 top-0 bottom-0 w-px bg-border/60" />
                {dayEvents.map((event) => {
                  const time = new Date(event.timestamp)
                  const timeStr = time.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                  })
                  return (
                    <div key={event.id} className="flex items-start gap-3 pl-2 pb-3">
                      <div className="w-5 h-5 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5 z-10" />
                      <div className="flex flex-col gap-1 pt-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {event.projectSlug}
                          </span>
                          <span className="text-[11px] text-muted-foreground/40">{timeStr}</span>
                        </div>
                        <p className="text-sm text-foreground/90 leading-relaxed line-clamp-2 [overflow-wrap:anywhere]">
                          {event.description}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                className="px-4 py-2 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
