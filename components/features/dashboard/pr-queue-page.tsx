"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { ExternalLink, ArrowUpDown, MessageSquareWarning } from "lucide-react"
import { ALL_PRS, getProject, getPRAge, type Domain } from "@/lib/mock-data"
import { DomainBadge } from "@/components/features/dashboard/domain-badge"
import { PRStatusBadge, CheckStatusBadge } from "@/components/features/dashboard/status-badges"
import { cn } from "@/lib/utils"

type SortKey = "age" | "project" | "status"

const STATUS_ORDER = { draft: 0, open: 1, reviewed: 2, "changes-requested": 3, approved: 4, merged: 5 }

export default function PRQueuePage() {
  const [domainFilter, setDomainFilter] = useState<Domain | "all">("all")
  const [sortKey, setSortKey] = useState<SortKey>("age")
  const [sortAsc, setSortAsc] = useState(true)

  const sorted = useMemo(() => {
    let prs = [...ALL_PRS]
    if (domainFilter !== "all") {
      prs = prs.filter((pr) => {
        const project = getProject(pr.projectSlug)
        return project?.domain === domainFilter
      })
    }

    prs.sort((a, b) => {
      let diff = 0
      if (sortKey === "age") {
        diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      } else if (sortKey === "project") {
        diff = a.projectSlug.localeCompare(b.projectSlug)
      } else if (sortKey === "status") {
        diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      }
      return sortAsc ? diff : -diff
    })
    return prs
  }, [domainFilter, sortKey, sortAsc])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const DOMAINS: Domain[] = ["arcanelayer", "aiteam", "joshowensdev", "infrastructure", "wendyowensbooks"]
  const DOMAIN_LABELS: Record<Domain, string> = {
    arcanelayer: "Arcane Layer",
    aiteam: "AI Team",
    joshowensdev: "joshowens.dev",
    infrastructure: "Infrastructure",
    wendyowensbooks: "Wendy Owens Books",
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-balance">PR Queue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {ALL_PRS.length} open pull request{ALL_PRS.length !== 1 ? "s" : ""} across all projects
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setDomainFilter("all")}
          className={cn(
            "px-2.5 py-1 rounded text-xs font-medium transition-colors",
            domainFilter === "all" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
          )}
        >
          All Domains
        </button>
        {DOMAINS.map((d) => (
          <button
            type="button"
            key={d}
            onClick={() => setDomainFilter(d)}
            className={cn(
              "px-2.5 py-1 rounded text-xs font-medium transition-colors",
              domainFilter === d ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            {DOMAIN_LABELS[d]}
          </button>
        ))}
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="rounded-lg border border-border p-16 text-center text-muted-foreground text-sm">
          No open pull requests.
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <SortTh label="Project" sortKey="project" current={sortKey} asc={sortAsc} onSort={handleSort} />
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Pull Request
                </th>
                <SortTh label="Status" sortKey="status" current={sortKey} asc={sortAsc} onSort={handleSort} />
                <SortTh label="Age" sortKey="age" current={sortKey} asc={sortAsc} onSort={handleSort} />
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
                const project = getProject(pr.projectSlug)
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
                        <Link href={`/projects/${pr.projectSlug}`} className="font-medium hover:text-foreground text-foreground/80 transition-colors">
                          {pr.projectSlug}
                        </Link>
                        {project && <DomainBadge domain={project.domain} />}
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
                          <span>#{pr.number} {pr.title}</span>
                          <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
                        </a>
                        <code className="text-[11px] text-muted-foreground font-mono">{pr.branch}</code>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <PRStatusBadge status={pr.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("font-mono text-sm font-semibold", age.color)}>{age.label}</span>
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
  asc: _asc,
  onSort,
}: {
  label: string
  sortKey: SortKey
  current: SortKey
  asc: boolean
  onSort: (k: SortKey) => void
}) {
  const active = current === sortKey
  return (
    <th className="px-4 py-2.5 text-left">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        {label}
        <ArrowUpDown className={cn("w-3 h-3", active && "opacity-100", !active && "opacity-40")} />
      </button>
    </th>
  )
}
