"use client"

import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MessageSquareWarning,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import type { Domain } from "@/lib/constants"

function getPRAge(createdAt: string): { label: string; color: string } {
  const hours = (Date.now() - new Date(createdAt).getTime()) / 3600000
  if (hours < 24) return { label: `${Math.floor(hours)}h`, color: "text-emerald-400" }
  const days = Math.floor(hours / 24)
  if (days <= 3) return { label: `${days}d`, color: "text-amber-400" }
  return { label: `${days}d`, color: "text-red-400" }
}

import {
  EmptyState,
  ErrorState,
  PRRowSkeleton,
} from "@/components/features/dashboard/loading-states"
import { CheckStatusBadge, PRStatusBadge } from "@/components/features/dashboard/status-badges"
import { DOMAIN_LABELS, DOMAIN_ORDER } from "@/lib/constants"
import { usePRs, useProjects } from "@/lib/hooks"
import { mapPR } from "@/lib/mappers"
import { cn } from "@/lib/utils"

type SortKey = "age" | "project" | "status"

const STATUS_ORDER: Record<string, number> = {
  draft: 0,
  open: 1,
  reviewed: 2,
  "changes-requested": 3,
  approved: 4,
  merged: 5,
}

const DOMAINS: Domain[] = [...DOMAIN_ORDER]

export default function PRQueuePage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Initialize state from URL params
  const [sortKey, setSortKey] = useState<SortKey>(
    () => (searchParams.get("sort") as SortKey) ?? "age",
  )
  const [sortAsc, setSortAsc] = useState<boolean>(() => searchParams.get("dir") !== "desc")
  const [domainFilter, setDomainFilter] = useState<Domain | "all">(
    () => (searchParams.get("domain") as Domain) ?? "all",
  )

  const { data: rawData, isLoading, error, mutate } = usePRs()
  const { data: rawProjects } = useProjects()

  // Build a set of project names (slugs) that belong to the selected domain
  const domainProjectSlugs = useMemo(() => {
    if (domainFilter === "all") return null
    const projects = rawProjects ?? []
    return new Set(projects.filter((p) => p.domain === domainFilter).map((p) => p.name))
  }, [domainFilter, rawProjects])

  function updateURL(newSort: SortKey, newAsc: boolean, newDomain: Domain | "all") {
    const params = new URLSearchParams()
    if (newSort !== "age") params.set("sort", newSort)
    if (!newAsc) params.set("dir", "desc")
    if (newDomain !== "all") params.set("domain", newDomain)
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`)
  }

  function handleSort(key: SortKey) {
    const newAsc = sortKey === key ? !sortAsc : true
    setSortKey(key)
    setSortAsc(newAsc)
    updateURL(key, newAsc, domainFilter)
  }

  function handleDomainFilter(domain: Domain | "all") {
    setDomainFilter(domain)
    updateURL(sortKey, sortAsc, domain)
  }

  const mappedPRs = useMemo(() => {
    if (!rawData) return []
    return rawData.map((pr) => mapPR(pr, pr.project_id ?? ""))
  }, [rawData])

  const sorted = useMemo(() => {
    let prs = [...mappedPRs]

    if (domainFilter !== "all" && domainProjectSlugs) {
      prs = prs.filter((pr) => domainProjectSlugs.has(pr.projectSlug))
    }

    prs.sort((a, b) => {
      let diff = 0
      if (sortKey === "age") {
        diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      } else if (sortKey === "project") {
        diff = a.projectSlug.localeCompare(b.projectSlug)
      } else if (sortKey === "status") {
        diff = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
      }
      return sortAsc ? diff : -diff
    })
    return prs
  }, [mappedPRs, domainFilter, domainProjectSlugs, sortKey, sortAsc])

  const prCount = sorted.length

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">PR Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {prCount} open pull request{prCount !== 1 ? "s" : ""} across all projects
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => handleDomainFilter("all")}
          className={cn(
            "px-2.5 py-1 rounded text-xs font-medium transition-colors",
            domainFilter === "all"
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
          )}
        >
          All Domains
        </button>
        {DOMAINS.map((d) => (
          <button
            type="button"
            key={d}
            onClick={() => handleDomainFilter(d)}
            className={cn(
              "px-2.5 py-1 rounded text-xs font-medium transition-colors",
              domainFilter === d
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
            )}
          >
            {DOMAIN_LABELS[d]}
          </button>
        ))}
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Project
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Pull Request
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Age
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Checks
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Comments
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows
                <PRRowSkeleton key={i} />
              ))}
            </tbody>
          </table>
        </div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => mutate()} />
      ) : sorted.length === 0 ? (
        <EmptyState message="No open pull requests" />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <SortTh
                  label="Project"
                  sortKey="project"
                  current={sortKey}
                  asc={sortAsc}
                  onSort={handleSort}
                />
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Pull Request
                </th>
                <SortTh
                  label="Status"
                  sortKey="status"
                  current={sortKey}
                  asc={sortAsc}
                  onSort={handleSort}
                />
                <SortTh
                  label="Age"
                  sortKey="age"
                  current={sortKey}
                  asc={sortAsc}
                  onSort={handleSort}
                />
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Checks
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Comments
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((pr) => {
                const age = getPRAge(pr.createdAt)
                return (
                  <tr
                    key={pr.id}
                    className={cn(
                      "border-b border-border/50 last:border-0 hover:bg-muted/10 transition-colors",
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <Link
                          href={`/projects/${pr.projectSlug}`}
                          className="font-medium hover:text-foreground text-foreground/80 transition-colors"
                        >
                          {pr.projectSlug}
                        </Link>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <a
                          href={pr.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 font-medium text-sky-400 hover:text-sky-300 transition-colors"
                        >
                          <span>
                            #{pr.number} {pr.title}
                          </span>
                          <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
                        </a>
                        <code className="text-[11px] text-muted-foreground font-mono">
                          {pr.branch}
                        </code>
                        <span className="text-xs text-muted-foreground">{pr.author}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <PRStatusBadge status={pr.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("font-mono text-sm font-semibold", age.color)}>
                        {age.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <CheckStatusBadge status={pr.checkStatus} />
                    </td>
                    <td className="px-4 py-3">
                      {pr.unresolvedComments > 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-orange-500/15 text-orange-400 font-semibold text-xs border border-orange-500/30 animate-pulse">
                          <MessageSquareWarning className="w-3.5 h-3.5" />
                          {pr.unresolvedComments} unresolved
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">None</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SortTh({
  label,
  sortKey,
  current,
  asc,
  onSort,
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  asc: boolean
  onSort: (k: SortKey) => void
}) {
  const active = current === sortKey
  const Icon = active ? (asc ? ChevronUp : ChevronDown) : ArrowUpDown
  return (
    <th className="px-4 py-2.5 text-left">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
        <Icon className={cn("w-3 h-3", active && "opacity-100", !active && "opacity-40")} />
      </button>
    </th>
  )
}
