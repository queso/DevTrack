"use client"

import { useState, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { AlertCircle, Search } from "lucide-react"
import { useProjects } from "@/lib/hooks"
import type { ApiProject } from "@/types/api-responses"
import { DomainBadge } from "@/components/features/dashboard/domain-badge"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Domain constants
// ---------------------------------------------------------------------------

type Domain = "arcanelayer" | "aiteam" | "joshowensdev" | "infrastructure" | "wendyowensbooks"

const DOMAINS: Domain[] = ["arcanelayer", "aiteam", "joshowensdev", "infrastructure", "wendyowensbooks"]
const DOMAIN_LABELS: Record<Domain, string> = {
  arcanelayer: "Arcane Layer",
  aiteam: "AI Team",
  joshowensdev: "joshowens.dev",
  infrastructure: "Infrastructure",
  wendyowensbooks: "Wendy Owens Books",
}

// ---------------------------------------------------------------------------
// Activity level helpers
// ---------------------------------------------------------------------------

type ActivityLevel = "active-now" | "today" | "this-week" | "stale"

function getActivityLevel(lastActivityAt: Date | null | string | undefined): ActivityLevel {
  if (!lastActivityAt) return "stale"
  const ms = Date.now() - new Date(lastActivityAt).getTime()
  if (ms < 60 * 60 * 1000) return "active-now"
  if (ms < 24 * 60 * 60 * 1000) return "today"
  if (ms < 7 * 24 * 60 * 60 * 1000) return "this-week"
  return "stale"
}

function getOpenPRCount(project: ApiProject): number {
  return project.pullRequests.filter((pr) => pr.status !== "merged" && pr.status !== "closed").length
}

// ---------------------------------------------------------------------------
// Filter / sort types
// ---------------------------------------------------------------------------

type SortOption = "activity" | "name" | "attention"
type FilterDomain = Domain | "all"

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function ProjectCardSkeleton() {
  return (
    <output className="animate-pulse rounded-lg border border-border p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="h-4 w-2/3 rounded bg-muted" />
        <div className="h-3 w-12 rounded bg-muted" />
      </div>
      <div className="h-3 w-1/4 rounded bg-muted" />
      <div className="h-3 w-full rounded bg-muted" />
      <div className="h-3 w-4/5 rounded bg-muted" />
    </output>
  )
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {["s1", "s2", "s3", "s4", "s5", "s6"].map((id) => (
        <ProjectCardSkeleton key={id} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function ErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <AlertCircle className="w-8 h-8 text-destructive" />
      <p className="text-sm text-muted-foreground">
        Something went wrong.{message ? ` ${message}` : ""}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="px-3 py-1.5 rounded text-sm bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
      >
        Retry
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Initialize filter state from URL params
  const [search, setSearch] = useState<string>(() => searchParams.get("q") ?? "")
  const [domainFilter, setDomainFilter] = useState<FilterDomain>(() => {
    const d = searchParams.get("domain")
    return (d ?? "all") as FilterDomain
  })
  const [sort, setSort] = useState<SortOption>(() => {
    const s = searchParams.get("sort")
    return (s === "activity" || s === "name" ? s : "attention") as SortOption
  })

  const { data: projects, isLoading, error, mutate } = useProjects()

  // Sync filter state to URL
  function pushUrl(overrides: {
    domain?: FilterDomain
    q?: string
    sort?: SortOption
  }) {
    const params = new URLSearchParams()
    const d = overrides.domain ?? domainFilter
    const q = overrides.q !== undefined ? overrides.q : search
    const s = overrides.sort ?? sort

    if (d !== "all") params.set("domain", d)
    if (q) params.set("q", q)
    if (s !== "attention") params.set("sort", s)

    const paramStr = params.toString()
    router.replace(paramStr ? `/?${paramStr}` : "/")
  }

  function handleDomainFilter(d: FilterDomain) {
    setDomainFilter(d)
    pushUrl({ domain: d })
  }

  function handleSearch(q: string) {
    setSearch(q)
    pushUrl({ q })
  }

  function handleSort(s: SortOption) {
    setSort(s)
    pushUrl({ sort: s })
  }

  const filtered = useMemo(() => {
    if (!projects) return []

    let result = [...projects]

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    if (domainFilter !== "all") result = result.filter((p) => p.domain === domainFilter)

    const activityOrder: Record<ActivityLevel, number> = { "active-now": 0, today: 1, "this-week": 2, stale: 3 }

    if (sort === "activity") {
      result.sort(
        (a, b) =>
          activityOrder[getActivityLevel(a.lastActivityAt)] -
          activityOrder[getActivityLevel(b.lastActivityAt)]
      )
    } else if (sort === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name))
    } else {
      result.sort((a, b) => {
        const aScore =
          (getOpenPRCount(a) > 0 ? 0 : 2) +
          activityOrder[getActivityLevel(a.lastActivityAt)] * 0.1
        const bScore =
          (getOpenPRCount(b) > 0 ? 0 : 2) +
          activityOrder[getActivityLevel(b.lastActivityAt)] * 0.1
        return aScore - bScore
      })
    }

    return result
  }, [projects, search, domainFilter, sort])

  const totalPRs = projects?.reduce((sum, p) => sum + getOpenPRCount(p), 0) ?? 0
  const needsAttention =
    projects?.filter((p) => getOpenPRCount(p) > 0 || getActivityLevel(p.lastActivityAt) === "stale")
      .length ?? 0

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-balance">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {projects?.length ?? 0} projects &mdash;&nbsp;
          <span className="text-amber-400">{needsAttention} need attention</span>
          &nbsp;&mdash;&nbsp;
          <span className="text-sky-400">{totalPRs} PRs open</span>
        </p>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <FilterChip label="All Domains" active={domainFilter === "all"} onClick={() => handleDomainFilter("all")} />
          {DOMAINS.map((d) => (
            <FilterChip
              key={d}
              label={DOMAIN_LABELS[d]}
              active={domainFilter === d}
              onClick={() => handleDomainFilter(d)}
            />
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-52"
            />
          </div>

          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>Sort:</span>
            {(["attention", "activity", "name"] as SortOption[]).map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => handleSort(s)}
                className={cn(
                  "px-2.5 py-1 rounded text-xs transition-colors",
                  sort === s ? "bg-secondary text-foreground" : "hover:text-foreground"
                )}
              >
                {s === "attention" ? "Needs attention" : s === "activity" ? "Last activity" : "Name"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorState onRetry={() => mutate()} message={error instanceof Error ? error.message : undefined} />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {projects?.length === 0 ? "No projects found." : "No projects match your filters."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded text-xs font-medium transition-colors",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
      )}
    >
      {label}
    </button>
  )
}

function ProjectCard({ project }: { project: ApiProject }) {
  const activityLevel = getActivityLevel(project.lastActivityAt)
  const isActiveNow = activityLevel === "active-now"
  const isStale = activityLevel === "stale"
  const openPRCount = getOpenPRCount(project)
  const needsAttention = openPRCount > 0

  const activePrd = project.prds.find((p) => p.status === "in_progress")
  const doneItems = activePrd?.workItems.filter((w) => w.status === "done").length ?? 0
  const totalItems = activePrd?.workItems.length ?? 0

  return (
    <Link
      href={`/projects/${project.name}`}
      className={cn(
        "block rounded-lg border p-4 transition-all duration-200 hover:border-border/80 hover:bg-card/80 group",
        isActiveNow && "animate-pulse-glow border-emerald-500/50",
        !isActiveNow && isStale && "opacity-60 border-border/50",
        !isActiveNow && !isStale && "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-semibold text-sm text-foreground truncate">{project.name}</span>
          {project.domain && <DomainBadge domain={project.domain} />}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {needsAttention && (
            <span className="flex items-center gap-1 text-[11px] text-red-400">
              <AlertCircle className="w-3 h-3" />
              {openPRCount} PR
            </span>
          )}
          <ActivityDot level={activityLevel} />
        </div>
      </div>

      {activePrd && totalItems > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span className="truncate">{activePrd.title}</span>
            <span className="shrink-0 ml-2">{doneItems}/{totalItems}</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500/70 transition-all"
              style={{ width: `${Math.round((doneItems / totalItems) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {project.tags.map((tag) => (
            <span key={tag} className="text-[10px] text-muted-foreground/60 bg-muted/30 rounded px-1.5 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  )
}

function ActivityDot({ level }: { level: ActivityLevel }) {
  if (level === "active-now") {
    return (
      <span className="relative flex items-center justify-center w-3 h-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
      </span>
    )
  }
  if (level === "today") {
    return <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
  }
  if (level === "this-week") {
    return <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
  }
  return <span className="w-2 h-2 rounded-full bg-muted-foreground/30 inline-block" />
}
