"use client"

import {
  ChevronLeft,
  ChevronRight,
  Clock,
  GitPullRequest,
  LayoutDashboard,
  Terminal,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { ProjectCardSkeleton } from "@/components/features/dashboard/loading-states"
import { usePRs, useProjects } from "@/lib/hooks"
import type { Project } from "@/lib/ui-types"
import { cn } from "@/lib/utils"

const DOMAIN_ORDER = [
  "arcanelayer",
  "aiteam",
  "joshowensdev",
  "infrastructure",
  "wendyowensbooks",
] as const

const domainLabels: Record<string, string> = {
  arcanelayer: "Arcane Layer",
  aiteam: "AI Team",
  joshowensdev: "joshowens.dev",
  infrastructure: "Infrastructure",
  wendyowensbooks: "Wendy Owens Books",
}

const STORAGE_KEY = "sidebar-collapsed"
const MD_BREAKPOINT = 768

export default function Sidebar() {
  const pathname = usePathname()

  const { data: projectsRaw, isLoading: projectsLoading } = useProjects()
  const { data: prsRaw } = usePRs()

  const projects = (projectsRaw ?? []) as unknown as Project[]
  const openPRCount = (prsRaw ?? []).filter(
    (pr) => pr.status === "open" || pr.status === "draft",
  ).length

  // Default to expanded; apply localStorage/viewport preference after mount to avoid hydration mismatch
  const [collapsed, setCollapsed] = useState<boolean>(false)

  // Apply localStorage/viewport preference after mount to avoid hydration mismatch
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored !== null) {
        setCollapsed(stored === "true")
      } else {
        setCollapsed(window.innerWidth < MD_BREAKPOINT)
      }
    } catch {
      setCollapsed(window.innerWidth < MD_BREAKPOINT)
    }
  }, [])

  // Handle resize events
  useEffect(() => {
    function handleResize() {
      // Only auto-collapse/expand if no localStorage preference is set
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY)
        if (stored === null) {
          setCollapsed(window.innerWidth < MD_BREAKPOINT)
        }
      } catch {
        setCollapsed(window.innerWidth < MD_BREAKPOINT)
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // localStorage unavailable — state toggled in memory only
      }
      return next
    })
  }

  // Group projects by domain
  const projectsByDomain = DOMAIN_ORDER.reduce(
    (acc, domain) => {
      const domainProjects = projects.filter((p) => p.domain === domain)
      if (domainProjects.length) acc[domain] = domainProjects
      return acc
    },
    {} as Record<string, Project[]>,
  )

  return (
    <aside
      data-collapsed={collapsed ? "true" : undefined}
      className={cn(
        "shrink-0 flex flex-col h-screen bg-sidebar border-r border-sidebar-border sticky top-0 overflow-y-auto overflow-x-hidden transition-all",
        collapsed ? "w-14" : "w-56",
      )}
    >
      {/* Logo */}
      <div className="px-4 py-4 border-b border-sidebar-border flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2" aria-label="DevTrack">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Terminal className="w-4 h-4 text-primary" />
          </div>
          {!collapsed && (
            <span className="font-bold text-base tracking-tight text-foreground">DevTrack</span>
          )}
        </Link>
      </div>

      {/* Main nav */}
      <nav className="px-2 pt-3 pb-2 flex flex-col gap-0.5">
        <NavItem
          href="/"
          icon={<LayoutDashboard className="w-4 h-4" />}
          label="Dashboard"
          active={pathname === "/"}
          collapsed={collapsed}
        />
        <NavItem
          href="/timeline"
          icon={<Clock className="w-4 h-4" />}
          label="Timeline"
          active={pathname === "/timeline"}
          collapsed={collapsed}
        />
        <NavItem
          href="/prs"
          icon={<GitPullRequest className="w-4 h-4" />}
          label="PR Queue"
          active={pathname === "/prs"}
          badge={openPRCount > 0 ? openPRCount : undefined}
          collapsed={collapsed}
        />
      </nav>

      <div className="mx-3 my-2 border-t border-sidebar-border" />

      {/* Projects grouped by domain */}
      <div className="flex-1 px-2 pb-2 flex flex-col gap-3 overflow-y-auto">
        {projectsLoading ? (
          <>
            <ProjectCardSkeleton />
            <ProjectCardSkeleton />
            <ProjectCardSkeleton />
          </>
        ) : (
          Object.entries(projectsByDomain).map(([domain, domainProjects]) => (
            <div key={domain}>
              {!collapsed && (
                <div className="px-2 py-1 mb-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    {domainLabels[domain]}
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {domainProjects.map((project) => {
                  const isActive = pathname === `/projects/${project.slug}`
                  return (
                    <Link
                      key={project.slug}
                      href={`/projects/${project.slug}`}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50",
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          project.activityLevel === "active-now" && "bg-[var(--pulse-active)]",
                          project.activityLevel === "today" && "bg-[var(--pulse-today)]",
                          project.activityLevel === "this-week" && "bg-[var(--pulse-week)]",
                          project.activityLevel === "stale" && "bg-[var(--pulse-stale)]",
                        )}
                      />
                      {!collapsed && <span className="truncate">{project.name}</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom */}
      <div className="px-2 pb-3 border-t border-sidebar-border pt-2 flex flex-col gap-0.5">
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={toggleCollapsed}
          className="flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 w-full"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          {!collapsed && <span>Toggle sidebar</span>}
        </button>
      </div>
    </aside>
  )
}

function NavItem({
  href,
  icon,
  label,
  active,
  badge,
  collapsed,
}: {
  href: string
  icon: React.ReactNode
  label: string
  active: boolean
  badge?: number
  collapsed: boolean
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        "flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50",
      )}
    >
      {icon}
      {!collapsed && <span className="flex-1">{label}</span>}
      {!collapsed && badge !== undefined && (
        <span className="text-[10px] font-semibold bg-destructive/80 text-white rounded-full px-1.5 py-0.5 leading-none">
          {badge}
        </span>
      )}
    </Link>
  )
}
