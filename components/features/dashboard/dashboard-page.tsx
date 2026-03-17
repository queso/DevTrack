"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, AlertCircle } from "lucide-react"
import { useProjects } from "@/lib/hooks"
import { mapProject } from "@/lib/mappers"
import type { Project, Domain, WorkflowType } from "@/lib/mock-data"
import { DomainBadge } from "@/components/features/dashboard/domain-badge"
import { WorkflowBadge } from "@/components/features/dashboard/workflow-badge"
import {
  ProjectCardSkeleton,
  ErrorState,
  EmptyState,
} from "@/components/features/dashboard/loading-states"
import { cn } from "@/lib/utils"

const DOMAINS: Domain[] = ["arcanelayer", "aiteam", "joshowensdev", "infrastructure", "wendyowensbooks"]
const DOMAIN_LABELS: Record<Domain, string> = {
  arcanelayer: "Arcane Layer",
  aiteam: "AI Team",
  joshowensdev: "joshowens.dev",
  infrastructure: "Infrastructure",
  wendyowensbooks: "Wendy Owens Books",
}

type SortOption = "activity" | "name" | "attention"
type FilterDomain = Domain | "all"
type FilterWorkflow = WorkflowType | "all"

export default function DashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: rawData, isLoading, error, mutate } = useProjects()

  // Initialize state from URL params
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "")
  const [domainFilter, setDomainFilter] = useState<FilterDomain>(
    () => (searchParams.get("domain") ?? "all") as FilterDomain,
  )
  const [workflowFilter, setWorkflowFilter] = useState<FilterWorkflow>(
    () => (searchParams.get("workflow") ?? "all") as FilterWorkflow,
  )
  const [sort, setSort] = useState<SortOption>(
    () => (searchParams.get("sort") ?? "attention") as SortOption,
  )

  const projects: Project[] = useMemo(() => {
    if (!rawData) return []
    return rawData.map((p) => mapProject(p as Parameters<typeof mapProject>[0]))
  }, [rawData])

  const filtered = useMemo(() => {
    let result = [...projects]

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)) ||
          p.summaryLine.toLowerCase().includes(q),
      )
    }

    if (domainFilter !== "all") result = result.filter((p) => p.domain === domainFilter)
    if (workflowFilter !== "all") result = result.filter((p) => p.workflow === workflowFilter)

    const activityOrder = { "active-now": 0, today: 1, "this-week": 2, stale: 3 }
    if (sort === "activity") {
      result.sort((a, b) => activityOrder[a.activityLevel] - activityOrder[b.activityLevel])
    } else if (sort === "name") {
      result.sort((a, b) => a.name.localeCompare(b.name))
    } else {
      result.sort((a, b) => {
        const aScore = (a.openPRCount > 0 ? 0 : 2) + activityOrder[a.activityLevel] * 0.1
        const bScore = (b.openPRCount > 0 ? 0 : 2) + activityOrder[b.activityLevel] * 0.1
        return aScore - bScore
      })
    }

    return result
  }, [projects, search, domainFilter, workflowFilter, sort])

  function buildUrl(overrides: Record<string, string | null>) {
    const params = new URLSearchParams()
    const current = { q: search || null, domain: domainFilter === "all" ? null : domainFilter, workflow: workflowFilter === "all" ? null : workflowFilter, sort: sort === "attention" ? null : sort }
    const merged = { ...current, ...overrides }
    for (const [k, v] of Object.entries(merged)) {
      if (v !== null && v !== undefined) params.set(k, v)
    }
    const qs = params.toString()
    return qs ? `/?${qs}` : "/?"
  }

  function handleDomainFilter(value: FilterDomain) {
    setDomainFilter(value)
    router.replace(buildUrl({ domain: value === "all" ? null : value }))
  }

  function handleWorkflowFilter(value: FilterWorkflow) {
    setWorkflowFilter(value)
    router.replace(buildUrl({ workflow: value === "all" ? null : value }))
  }

  function handleSort(value: SortOption) {
    setSort(value)
    router.replace(buildUrl({ sort: value === "attention" ? null : value }))
  }

  function handleSearch(value: string) {
    setSearch(value)
    router.replace(buildUrl({ q: value || null }))
  }

  const totalPRs = projects.reduce((sum, p) => sum + p.openPRCount, 0)
  const needsAttention = projects.filter((p) => p.openPRCount > 0 || p.activityLevel === "stale").length

  if (error) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <ErrorState
          message={error.message}
          onRetry={() => mutate()}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-balance">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {projects.length} projects &mdash;&nbsp;
          <span className="text-amber-400">{needsAttention} need attention</span>
          &nbsp;&mdash;&nbsp;
          <span className="text-sky-400">{totalPRs} PRs open</span>
        </p>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Domain filter chips */}
          <FilterChip
            label="All Domains"
            active={domainFilter === "all"}
            onClick={() => handleDomainFilter("all")}
          />
          {DOMAINS.map((d) => (
            <FilterChip
              key={d}
              label={DOMAIN_LABELS[d]}
              active={domainFilter === d}
              onClick={() => handleDomainFilter(d)}
            />
          ))}

          <div className="w-px h-4 bg-border mx-1" />

          <FilterChip
            label="All Types"
            active={workflowFilter === "all"}
            onClick={() => handleWorkflowFilter("all")}
          />
          <FilterChip
            label="SDLC"
            active={workflowFilter === "sdlc"}
            onClick={() => handleWorkflowFilter("sdlc")}
          />
          <FilterChip
            label="Content"
            active={workflowFilter === "content"}
            onClick={() => handleWorkflowFilter("content")}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
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

          {/* Sort */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>Sort:</span>
            {(["attention", "activity", "name"] as SortOption[]).map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => handleSort(s)}
                className={cn(
                  "px-2.5 py-1 rounded text-xs transition-colors",
                  sort === s ? "bg-secondary text-foreground" : "hover:text-foreground",
                )}
              >
                {s === "attention" ? "Needs attention" : s === "activity" ? "Last activity" : "Name"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Project Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState message="No projects match your filters." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((project) => (
            <ProjectCard key={project.slug} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded text-xs font-medium transition-colors",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
      )}
    >
      {label}
    </button>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const isActiveNow = project.activityLevel === "active-now"
  const isStale = project.activityLevel === "stale"
  const needsAttention = project.openPRCount > 0

  const doneItems = project.activePRD?.workItems.filter((w) => w.status === "done").length ?? 0
  const totalItems = project.activePRD?.workItems.length ?? 0

  return (
    <Link
      href={`/projects/${project.slug}`}
      className={cn(
        "block rounded-lg border p-4 transition-all duration-200 hover:border-border/80 hover:bg-card/80 group",
        isActiveNow && "animate-pulse-glow border-emerald-500/50",
        !isActiveNow && isStale && "opacity-60 border-border/50",
        !isActiveNow && !isStale && "border-border",
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="font-semibold text-sm text-foreground truncate">{project.name}</span>
          <DomainBadge domain={project.domain} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {needsAttention && (
            <span className="flex items-center gap-1 text-[11px] text-red-400">
              <AlertCircle className="w-3 h-3" />
              {project.openPRCount} PR
            </span>
          )}
          <ActivityDot level={project.activityLevel} />
        </div>
      </div>

      {/* Workflow + summary */}
      <div className="flex items-center gap-1.5 mb-2">
        <WorkflowBadge workflow={project.workflow} />
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed mb-3">{project.summaryLine}</p>

      {/* Progress bar */}
      {project.activePRD && totalItems > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span className="shrink-0 ml-auto">{doneItems}/{totalItems}</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500/70 transition-all"
              style={{ width: `${Math.round((doneItems / totalItems) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Tags */}
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

function ActivityDot({ level }: { level: Project["activityLevel"] }) {
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
