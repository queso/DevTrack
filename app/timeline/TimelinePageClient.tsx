"use client"

import { useState, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTimeline, useProjects } from "@/lib/hooks"
import { mapTimelineEvent } from "@/lib/mappers"
import type { Event as ApiEvent } from "@/types/event"
import type { Domain, EventType } from "@/lib/mock-data"
import {
  TimelineEntrySkeleton,
  EmptyState,
} from "@/components/features/dashboard/loading-states"
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
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const eventDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  if (eventDay.getTime() === today.getTime()) return "Today"
  if (eventDay.getTime() === yesterday.getTime()) return "Yesterday"

  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const diff = today.getTime() - eventDay.getTime()
  if (diff < 7 * 86400000) return days[eventDay.getDay()]
  return `${days[eventDay.getDay()]}, ${months[eventDay.getMonth()]} ${eventDay.getDate()}`
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

const DOMAINS: Domain[] = ["arcanelayer", "aiteam", "joshowensdev", "infrastructure", "wendyowensbooks"]
const DOMAIN_LABELS: Record<Domain, string> = {
  arcanelayer: "Arcane Layer",
  aiteam: "AI Team",
  joshowensdev: "joshowens.dev",
  infrastructure: "Infrastructure",
  wendyowensbooks: "Wendy Owens Books",
}

const ALL_EVENT_TYPES: EventType[] = [
  "commit",
  "pr-opened",
  "pr-reviewed",
  "pr-merged",
  "prd-update",
  "deploy",
  "published",
  "draft-started",
]

const EVENT_TYPE_LABELS: Record<string, string> = {
  commit: "Commits",
  "pr-opened": "PR Opened",
  "pr-reviewed": "PR Reviewed",
  "pr-merged": "PR Merged",
  "prd-update": "PRD Update",
  deploy: "Deploy",
  published: "Published",
  "draft-started": "Draft Started",
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
  const typeParam = (searchParams.get("type") ?? "all") as EventType | "all"
  const pageParam = Number(searchParams.get("page") ?? "1")

  // Local filter state (mirrors URL)
  const [quickRange, setQuickRange] = useState<QuickRange>(rangeParam)
  const [projectFilter, setProjectFilter] = useState<string>(projectParam)
  const [domainFilter, setDomainFilter] = useState<Domain | "all">(domainParam)
  const [eventTypeFilter, setEventTypeFilter] = useState<EventType | "all">(typeParam)
  const [page, setPage] = useState<number>(pageParam)

  // Fetch data
  const { data: rawEvents, meta, isLoading, error, mutate } = useTimeline()
  const { data: rawProjects } = useProjects()

  // Map projects
  const projects = useMemo(() => {
    if (!rawProjects) return []
    return rawProjects as Array<{ id: string; name: string; domain: string | null; workflow: string }>
  }, [rawProjects])

  // Map events using mapTimelineEvent
  const events = useMemo(() => {
    if (!rawEvents) return []
    return (rawEvents as ApiEvent[]).map((e) => {
      const project = projects.find((p) => p.id === e.projectId)
      return mapTimelineEvent(e, project?.name ?? e.projectId)
    })
  }, [rawEvents, projects])

  // Apply client-side filters
  const filteredEvents = useMemo(() => {
    let result = events

    if (projectFilter !== "all") {
      result = result.filter((e) => e.projectSlug === projectFilter)
    }

    if (domainFilter !== "all") {
      const domainProjects = projects
        .filter((p) => p.domain === domainFilter)
        .map((p) => p.name)
      result = result.filter((e) => domainProjects.includes(e.projectSlug))
    }

    if (eventTypeFilter !== "all") {
      result = result.filter((e) => e.type === eventTypeFilter)
    }

    if (quickRange !== "all") {
      const now = Date.now()
      const weekMs = 7 * 24 * 60 * 60 * 1000
      result = result.filter((e) => now - new Date(e.timestamp).getTime() < weekMs)
    }

    return result
  }, [events, projectFilter, domainFilter, eventTypeFilter, quickRange, projects])

  // Group by day
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filteredEvents>()
    for (const e of filteredEvents) {
      const key = getDayLabel(e.timestamp)
      if (!map.has(key)) map.set(key, [])
      map.get(key)?.push(e)
    }
    return map
  }, [filteredEvents])

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

  function handleEventTypeFilter(value: EventType | "all") {
    setEventTypeFilter(value)
    setPage(1)
    navigate({ type: value === "all" ? null : String(value), page: null })
  }

  function handleLoadMore() {
    const next = page + 1
    setPage(next)
    navigate({ page: String(next) })
  }

  // Determine if "load more" should show
  // Show when there is a next page: page * per_page < total
  const hasMore =
    meta !== undefined &&
    meta.total > 0 &&
    meta.page * meta.per_page < meta.total

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
        <p className="text-sm text-muted-foreground mt-1">Cross-project activity feed for standups and recaps</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        {/* Date range quick buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {(["week", "all"] as QuickRange[]).map((r) => (
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
              {r === "week" ? "This week" : "All time"}
            </button>
          ))}
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
              <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>
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
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>

          {/* Event type filter */}
          <select
            aria-label="event type"
            value={eventTypeFilter}
            onChange={(e) => handleEventTypeFilter(e.target.value as EventType | "all")}
            className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Types</option>
            {ALL_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{EVENT_TYPE_LABELS[t] ?? t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Timeline content */}
      {filteredEvents.length === 0 ? (
        <EmptyState message="No events match your filters." />
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(grouped.entries()).map(([day, dayEvents]) => (
            <section
              key={day}
              aria-label={day}
              className="flex flex-col gap-3"
            >
              {/* Day header */}
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-foreground">{day}</h2>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Day summary */}
              <div className="rounded-md bg-muted/30 border border-border/50 px-3 py-2 text-xs text-muted-foreground">
                {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
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
                          <span className="text-[11px] font-mono text-muted-foreground">{event.projectSlug}</span>
                          <span className="text-[11px] text-muted-foreground/40">{timeStr}</span>
                        </div>
                        <p className="text-sm text-foreground/90 leading-relaxed">{event.description}</p>
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
