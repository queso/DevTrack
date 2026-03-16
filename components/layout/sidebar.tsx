"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Clock, GitPullRequest, Settings, Terminal } from "lucide-react"
import { cn } from "@/lib/utils"
import { PROJECTS, } from "@/lib/mock-data"
import { ALL_PRS } from "@/lib/mock-data"

const DOMAIN_ORDER = ["arcanelayer", "aiteam", "joshowensdev", "infrastructure", "wendyowensbooks"] as const

export default function Sidebar() {
  const pathname = usePathname()
  const openPRCount = ALL_PRS.length

  const projectsByDomain = DOMAIN_ORDER.reduce((acc, domain) => {
    const projects = PROJECTS.filter((p) => p.domain === domain)
    if (projects.length) acc[domain] = projects
    return acc
  }, {} as Record<string, typeof PROJECTS>)

  const domainLabels: Record<string, string> = {
    arcanelayer: "Arcane Layer",
    aiteam: "AI Team",
    joshowensdev: "joshowens.dev",
    infrastructure: "Infrastructure",
    wendyowensbooks: "Wendy Owens Books",
  }

  return (
    <aside className="w-56 shrink-0 flex flex-col h-screen bg-sidebar border-r border-sidebar-border sticky top-0 overflow-y-auto">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-sidebar-border">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
            <Terminal className="w-4 h-4 text-primary" />
          </div>
          <span className="font-bold text-base tracking-tight text-foreground">DevTrack</span>
        </Link>
      </div>

      {/* Main nav */}
      <nav className="px-2 pt-3 pb-2 flex flex-col gap-0.5">
        <NavItem href="/" icon={<LayoutDashboard className="w-4 h-4" />} label="Dashboard" active={pathname === "/"} />
        <NavItem href="/timeline" icon={<Clock className="w-4 h-4" />} label="Timeline" active={pathname === "/timeline"} />
        <NavItem
          href="/prs"
          icon={<GitPullRequest className="w-4 h-4" />}
          label="PR Queue"
          active={pathname === "/prs"}
          badge={openPRCount > 0 ? openPRCount : undefined}
        />
      </nav>

      <div className="mx-3 my-2 border-t border-sidebar-border" />

      {/* Projects grouped by domain */}
      <div className="flex-1 px-2 pb-2 flex flex-col gap-3 overflow-y-auto">
        {Object.entries(projectsByDomain).map(([domain, projects]) => (
          <div key={domain}>
            <div className="px-2 py-1 mb-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                {domainLabels[domain]}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {projects.map((project) => (
                <Link
                  key={project.slug}
                  href={`/projects/${project.slug}`}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors",
                    pathname === `/projects/${project.slug}`
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
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
                  <span className="truncate">{project.name}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom */}
      <div className="px-2 pb-3 border-t border-sidebar-border pt-2">
        <NavItem href="/settings" icon={<Settings className="w-4 h-4" />} label="Settings" active={pathname === "/settings"} />
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
}: {
  href: string
  icon: React.ReactNode
  label: string
  active: boolean
  badge?: number
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-2 py-1.5 rounded text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
      )}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span className="text-[10px] font-semibold bg-destructive/80 text-white rounded-full px-1.5 py-0.5 leading-none">
          {badge}
        </span>
      )}
    </Link>
  )
}
