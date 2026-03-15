"use client"

import { useState } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ExternalLink,
  Github,
  GitBranch,
  GitPullRequest,
  CheckCircle2,
  Circle,
  Clock,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Loader2,
  FileText,
  Rocket,
  MessageSquare,
  GitCommit,
  Lightbulb,
  PenLine,
  Globe,
} from "lucide-react"
import { getProject, getRelativeTime, type WorkItem, type TimelineEvent, TIMELINE_EVENTS } from "@/lib/mock-data"
import { DomainBadge } from "@/components/features/dashboard/domain-badge"
import { WorkflowBadge } from "@/components/features/dashboard/workflow-badge"
import { PRStatusBadge, CheckStatusBadge } from "@/components/features/dashboard/status-badges"
import { cn } from "@/lib/utils"

export default function ProjectPage({ slug }: { slug: string }) {
  const project = getProject(slug)
  if (!project) return notFound()

  const events = TIMELINE_EVENTS.filter((e) => e.projectSlug === slug).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl">
      {/* Back */}
      <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit">
        <ArrowLeft className="w-3.5 h-3.5" />
        Dashboard
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          <DomainBadge domain={project.domain} />
          <WorkflowBadge workflow={project.workflow} />
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5">
          {project.tags.map((t) => (
            <span key={t} className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-0.5">{t}</span>
          ))}
        </div>

        {/* Links + health */}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <a href={project.repoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <Github className="w-4 h-4" />
            <span>Repository</span>
            <ExternalLink className="w-3 h-3 opacity-50" />
          </a>
          {project.deployUrl && (
            <a href={project.deployUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
              <Globe className="w-4 h-4" />
              <span>Live site</span>
              <ExternalLink className="w-3 h-3 opacity-50" />
            </a>
          )}
          <div className="flex items-center gap-4 text-muted-foreground text-xs">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {project.daysSinceActivity === 0 ? "Active today" : `${project.daysSinceActivity}d since activity`}
            </span>
            <span className="flex items-center gap-1">
              <GitPullRequest className="w-3.5 h-3.5" />
              {project.openPRCount} open PR{project.openPRCount !== 1 ? "s" : ""}
            </span>
            <CheckStatusBadge status={project.checkStatus} />
          </div>
        </div>
      </div>

      <div className="border-t border-border" />

      {project.workflow === "sdlc" ? (
        <SDLCView project={project as Parameters<typeof SDLCView>[0]["project"]} events={events} />
      ) : (
        <ContentView project={project as Parameters<typeof ContentView>[0]["project"]} events={events} />
      )}
    </div>
  )
}

function SDLCView({ project, events }: { project: ReturnType<typeof getProject> & {}; events: TimelineEvent[] }) {
  if (!project) return null
  const [shippedOpen, setShippedOpen] = useState(false)

  const doneItems = project.activePRD?.workItems.filter((w) => w.status === "done").length ?? 0
  const totalItems = project.activePRD?.workItems.length ?? 0
  const progressPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0

  return (
    <div className="flex flex-col gap-6">
      {/* Current Work */}
      {project.activePRD && (
        <section>
          <SectionHeader title="Current Work" />
          <div className="rounded-lg border border-border p-4 flex flex-col gap-4">
            {/* PRD */}
            <div>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <h3 className="font-semibold text-base">{project.activePRD.title}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{project.activePRD.summary}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{doneItems}/{totalItems} done</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3 mt-2">
                <div
                  className="h-full rounded-full bg-emerald-500/70 transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                {project.activePRD.workItems.map((item) => (
                  <WorkItemRow key={item.id} item={item} />
                ))}
              </div>
            </div>

            {/* Branch + PR */}
            {(project.currentBranch || project.currentPR) && (
              <div className="border-t border-border pt-3 flex flex-col gap-2">
                {project.currentBranch && (
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="w-4 h-4 text-muted-foreground shrink-0" />
                    <code className="font-mono text-xs bg-muted/60 px-1.5 py-0.5 rounded text-sky-400">
                      {project.currentBranch}
                    </code>
                    {project.currentPR && (
                      <>
                        <span className="text-muted-foreground">&mdash;</span>
                        <a
                          href={project.currentPR.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-xs"
                        >
                          PR #{project.currentPR.number}: {project.currentPR.title}
                          <ExternalLink className="w-3 h-3 opacity-50" />
                        </a>
                        <PRStatusBadge status={project.currentPR.status} />
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Recent commits */}
            {project.recentCommits && project.recentCommits.length > 0 && (
              <div className="border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Recent Commits</p>
                <div className="flex flex-col gap-1.5">
                  {project.recentCommits.map((commit) => (
                    <div key={commit.sha} className="flex items-center gap-2 text-sm">
                      <code className="font-mono text-[11px] text-muted-foreground/60 w-14 shrink-0">{commit.sha}</code>
                      <span className="text-muted-foreground truncate flex-1">{commit.message}</span>
                      <span className="text-[11px] text-muted-foreground/50 shrink-0">{getRelativeTime(commit.timestamp)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Pipeline */}
      <section>
        <SectionHeader title="Pipeline" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Up Next */}
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Up Next</p>
            {project.upNextPRDs && project.upNextPRDs.length > 0 ? (
              <div className="flex flex-col gap-3">
                {project.upNextPRDs.map((prd) => (
                  <div key={prd.id} className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{prd.title}</span>
                    <span className="text-xs text-muted-foreground">{prd.summary}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing queued.</p>
            )}
          </div>

          {/* Shipped */}
          <div className="rounded-lg border border-border p-4">
            <button
              className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3"
              onClick={() => setShippedOpen(!shippedOpen)}
            >
              <span>Shipped</span>
              {shippedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {shippedOpen && project.shippedPRDs && project.shippedPRDs.length > 0 ? (
              <div className="flex flex-col gap-3">
                {project.shippedPRDs.map((prd) => (
                  <div key={prd.id} className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{prd.title}</span>
                    {prd.completedAt && (
                      <span className="text-[11px] text-muted-foreground">{getRelativeTime(prd.completedAt)}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : !shippedOpen ? (
              <p className="text-sm text-muted-foreground">Click to expand.</p>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing shipped yet.</p>
            )}
          </div>
        </div>
      </section>

      {/* Activity Timeline */}
      <ActivityTimeline events={events} />
    </div>
  )
}

function ContentView({ project, events }: { project: ReturnType<typeof getProject> & {}; events: TimelineEvent[] }) {
  if (!project) return null
  const [publishedOpen, setPublishedOpen] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      {/* Content Pipeline */}
      <section>
        <SectionHeader title="Content Pipeline" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Ideas */}
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5" /> Ideas ({project.ideas?.length ?? 0})
            </p>
            <div className="flex flex-col gap-2">
              {(project.ideas ?? []).map((idea) => (
                <div key={idea.id}>
                  <p className="text-sm font-medium leading-snug">{idea.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{idea.summary}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Drafts */}
          <div className="rounded-lg border border-border p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <PenLine className="w-3.5 h-3.5" /> Drafts ({project.drafts?.length ?? 0})
            </p>
            <div className="flex flex-col gap-2">
              {(project.drafts ?? []).map((draft) => (
                <div key={draft.id} className="flex items-start gap-2">
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-medium mt-0.5 shrink-0",
                    draft.status === "review" ? "bg-amber-400/10 text-amber-400" : "bg-sky-400/10 text-sky-400"
                  )}>
                    {draft.status}
                  </span>
                  <p className="text-sm">{draft.title}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Published */}
          <div className="rounded-lg border border-border p-4">
            <button
              className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3"
              onClick={() => setPublishedOpen(!publishedOpen)}
            >
              <span className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" /> Published ({project.published?.length ?? 0})
              </span>
              {publishedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            {publishedOpen && (
              <div className="flex flex-col gap-2">
                {(project.published ?? []).map((post) => (
                  <div key={post.id}>
                    <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-sm hover:text-foreground text-muted-foreground flex items-center gap-1">
                      {post.title}
                      <ExternalLink className="w-3 h-3 opacity-50 shrink-0" />
                    </a>
                    <p className="text-[11px] text-muted-foreground/60">{getRelativeTime(post.publishedAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Activity Timeline */}
      <ActivityTimeline events={events} />
    </div>
  )
}

function WorkItemRow({ item }: { item: WorkItem }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      {item.status === "done" && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
      {item.status === "in-progress" && <Loader2 className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />}
      {item.status === "todo" && <Circle className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
      <span className={cn(
        item.status === "done" && "text-muted-foreground line-through",
        item.status === "in-progress" && "text-foreground",
        item.status === "todo" && "text-muted-foreground/60",
      )}>
        {item.title}
      </span>
    </div>
  )
}

const EVENT_ICON: Record<string, React.ReactNode> = {
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

function ActivityTimeline({ events }: { events: TimelineEvent[] }) {
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all")

  const filtered = eventTypeFilter === "all" ? events : events.filter((e) => e.type === eventTypeFilter)

  const eventTypes = ["all", ...Array.from(new Set(events.map((e) => e.type)))]

  return (
    <section>
      <SectionHeader title="Activity Timeline" />
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        {eventTypes.map((type) => (
          <button
            key={type}
            onClick={() => setEventTypeFilter(type)}
            className={cn(
              "px-2.5 py-1 rounded text-xs transition-colors capitalize",
              eventTypeFilter === type
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            {type === "all" ? "All events" : type.replace("-", " ")}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events.</p>
      ) : (
        <div className="relative flex flex-col gap-0">
          <div className="absolute left-3.5 top-0 bottom-0 w-px bg-border" />
          {filtered.map((event) => (
            <div key={event.id} className="flex items-start gap-3 pl-2 pb-4">
              <div className="w-5 h-5 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground shrink-0 mt-0.5 z-10">
                {EVENT_ICON[event.type] ?? <Circle className="w-3 h-3" />}
              </div>
              <div className="flex flex-col gap-0.5 pt-0.5">
                <p className="text-sm text-foreground/90">{event.description}</p>
                <p className="text-[11px] text-muted-foreground">{getRelativeTime(event.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function SectionHeader({ title }: { title: string }) {
  return <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">{title}</h2>
}
