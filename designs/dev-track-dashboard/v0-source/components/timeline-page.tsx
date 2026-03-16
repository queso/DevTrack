"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from "date-fns"
import {
  GitCommit, GitBranch, GitPullRequest, MessageSquare,
  FileText, Rocket, Globe, PenLine, Circle, Filter, CalendarIcon
} from "lucide-react"
import {
  TIMELINE_EVENTS, PROJECTS, 
  type Domain, type EventType
} from "@/lib/mock-data"
import { DomainBadge } from "@/components/domain-badge"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { DateRange as DateRangeType } from "react-day-picker"

type QuickRange = "today" | "yesterday" | "week" | "custom" | "all"

const EVENT_ICONS: Record<EventType, React.ReactNode> = {
  commit: <GitCommit className="w-3.5 h-3.5" />,
  branch: <GitBranch className="w-3.5 h-3.5" />,
  "pr-opened": <GitPullRequest className="w-3.5 h-3.5" />,
  "pr-reviewed": <MessageSquare className="w-3.5 h-3.5" />,
  "pr-merged": <GitPullRequest className="w-3.5 h-3.5" />,
  "prd-update": <FileText className="w-3.5 h-3.5" />,
  deploy: <Rocket className="w-3.5 h-3.5" />,
  published: <Globe className="w-3.5 h-3.5" />,
  "draft-started": <PenLine className="w-3.5 h-3.5" />,
}

const EVENT_COLORS: Record<EventType, string> = {
  commit: "text-muted-foreground",
  branch: "text-sky-400",
  "pr-opened": "text-sky-400",
  "pr-reviewed": "text-amber-400",
  "pr-merged": "text-emerald-400",
  "prd-update": "text-purple-400",
  deploy: "text-emerald-400",
  published: "text-emerald-400",
  "draft-started": "text-amber-400",
}

function getDayKey(timestamp: string): string {
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

function isWithinQuickRange(timestamp: string, range: QuickRange, customRange?: DateRangeType): boolean {
  const eventDate = new Date(timestamp)
  const now = new Date()

  if (range === "today") {
    return isWithinInterval(eventDate, { start: startOfDay(now), end: endOfDay(now) })
  }
  if (range === "yesterday") {
    const yesterday = subDays(now, 1)
    return isWithinInterval(eventDate, { start: startOfDay(yesterday), end: endOfDay(yesterday) })
  }
  if (range === "week") {
    return isWithinInterval(eventDate, { start: startOfDay(subDays(now, 7)), end: endOfDay(now) })
  }
  if (range === "custom" && customRange?.from) {
    const start = startOfDay(customRange.from)
    const end = customRange.to ? endOfDay(customRange.to) : endOfDay(customRange.from)
    return isWithinInterval(eventDate, { start, end })
  }
  return true // "all"
}

export default function TimelinePage() {
  const [quickRange, setQuickRange] = useState<QuickRange>("week")
  const [customDateRange, setCustomDateRange] = useState<DateRangeType | undefined>(undefined)
  const [projectFilter, setProjectFilter] = useState<string>("all")
  const [domainFilter, setDomainFilter] = useState<Domain | "all">("all")
  const [eventTypeFilter, setEventTypeFilter] = useState<EventType | "all">("all")

  const handleQuickRangeChange = (range: QuickRange) => {
    setQuickRange(range)
    if (range !== "custom") {
      setCustomDateRange(undefined)
    }
  }

  const handleDateRangeSelect = (range: DateRangeType | undefined) => {
    setCustomDateRange(range)
    if (range?.from) {
      setQuickRange("custom")
    }
  }

  const filtered = useMemo(() => {
    return TIMELINE_EVENTS.filter((e) => {
      if (!isWithinQuickRange(e.timestamp, quickRange, customDateRange)) return false
      if (projectFilter !== "all" && e.projectSlug !== projectFilter) return false
      if (domainFilter !== "all") {
        const project = PROJECTS.find((p) => p.slug === e.projectSlug)
        if (project?.domain !== domainFilter) return false
      }
      if (eventTypeFilter !== "all" && e.type !== eventTypeFilter) return false
      return true
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [quickRange, customDateRange, projectFilter, domainFilter, eventTypeFilter])

  // Group by day
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    for (const e of filtered) {
      const key = getDayKey(e.timestamp)
      if (!map.has(key)) map.set(key, [])
      map.get(key)?.push(e)
    }
    return map
  }, [filtered])

  function getDaySummary(events: typeof filtered) {
    const commits = events.filter((e) => e.type === "commit").length
    const prs = events.filter((e) => e.type === "pr-opened" || e.type === "pr-merged").length
    const deploys = events.filter((e) => e.type === "deploy").length
    const published = events.filter((e) => e.type === "published").length
    const drafts = events.filter((e) => e.type === "draft-started").length
    const projects = new Set(events.map((e) => e.projectSlug)).size

    const parts: string[] = []
    if (commits > 0) parts.push(`${commits} commit${commits !== 1 ? "s" : ""}`)
    if (prs > 0) parts.push(`${prs} PR${prs !== 1 ? "s" : ""}`)
    if (deploys > 0) parts.push(`${deploys} deploy${deploys !== 1 ? "s" : ""}`)
    if (published > 0) parts.push(`${published} published`)
    if (drafts > 0) parts.push(`${drafts} draft${drafts !== 1 ? "s" : ""} started`)
    if (projects > 1) parts.push(`across ${projects} projects`)

    return parts.join(", ") || "No activity"
  }

  const ALL_EVENT_TYPES: EventType[] = ["commit", "pr-opened", "pr-reviewed", "pr-merged", "prd-update", "deploy", "published", "draft-started"]
  const DOMAINS: Domain[] = ["arcanelayer", "aiteam", "joshowensdev", "infrastructure", "wendyowensbooks"]
  const DOMAIN_LABELS: Record<Domain, string> = {
    arcanelayer: "Arcane Layer",
    aiteam: "AI Team",
    joshowensdev: "joshowens.dev",
    infrastructure: "Infrastructure",
    wendyowensbooks: "Wendy Owens Books",
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
        {/* Date range: quick buttons + date range picker */}
        <div className="flex items-center gap-2 flex-wrap">
          {(["today", "yesterday", "week", "all"] as QuickRange[]).map((r) => (
            <button
              key={r}
              onClick={() => handleQuickRangeChange(r)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium transition-colors capitalize",
                quickRange === r ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
              )}
            >
              {r === "week" ? "This week" : r === "all" ? "All time" : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}

          {/* Date Range Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={quickRange === "custom" ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 px-2.5 text-xs font-medium gap-1.5",
                  quickRange === "custom" && "bg-secondary text-foreground"
                )}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                {quickRange === "custom" && customDateRange?.from ? (
                  customDateRange.to ? (
                    <>
                      {format(customDateRange.from, "MMM d")} - {format(customDateRange.to, "MMM d")}
                    </>
                  ) : (
                    format(customDateRange.from, "MMM d, yyyy")
                  )
                ) : (
                  "Custom"
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={customDateRange}
                onSelect={handleDateRangeSelect}
                numberOfMonths={2}
                disabled={{ after: new Date() }}
                defaultMonth={subDays(new Date(), 30)}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Domain + Project + Event type row */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted-foreground flex items-center gap-1"><Filter className="w-3 h-3" /> Filter:</span>

          {/* Domain filter */}
          <select
            value={domainFilter}
            onChange={(e) => setDomainFilter(e.target.value as Domain | "all")}
            className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Domains</option>
            {DOMAINS.map((d) => (
              <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>
            ))}
          </select>

          {/* Project filter */}
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Projects</option>
            {PROJECTS.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>

          {/* Event type filter */}
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value as EventType | "all")}
            className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Events</option>
            {ALL_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>{t.replace("-", " ")}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Timeline */}
      {grouped.size === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">No events match your filters.</div>
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(grouped.entries()).map(([day, events]) => (
            <div key={day} className="flex flex-col gap-3">
              {/* Day header */}
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-foreground">{day}</h2>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Day summary */}
              <div className="rounded-md bg-muted/30 border border-border/50 px-3 py-2 text-xs text-muted-foreground">
                {getDaySummary(events)}
              </div>

              {/* Events */}
              <div className="relative flex flex-col gap-0">
                <div className="absolute left-3.5 top-0 bottom-0 w-px bg-border/60" />
                {events.map((event) => {
                  const project = PROJECTS.find((p) => p.slug === event.projectSlug)
                  const time = new Date(event.timestamp)
                  const timeStr = time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
                  return (
                    <div key={event.id} className="flex items-start gap-3 pl-2 pb-3 group">
                      <div className={cn(
                        "w-5 h-5 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 mt-0.5 z-10",
                        EVENT_COLORS[event.type]
                      )}>
                        {EVENT_ICONS[event.type] ?? <Circle className="w-3 h-3" />}
                      </div>
                      <div className="flex flex-col gap-1 pt-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {project && (
                            <Link href={`/projects/${project.slug}`} className="hover:underline">
                              <DomainBadge domain={project.domain} />
                            </Link>
                          )}
                          <span className="text-[11px] font-mono text-muted-foreground">{project?.name}</span>
                          <span className="text-[11px] text-muted-foreground/40">{timeStr}</span>
                        </div>
                        <p className="text-sm text-foreground/90 leading-relaxed">{event.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
