export type ActivityLevel = "active-now" | "today" | "this-week" | "stale"
export type PRStatus = "draft" | "open" | "reviewed" | "changes-requested" | "approved" | "merged"
export type CheckStatus = "passing" | "failing" | "pending"
export type EventType = "commit" | "branch" | "pr-opened" | "pr-reviewed" | "pr-merged" | "prd-update" | "deploy"

export interface WorkItem {
  id: string
  title: string
  status: "done" | "in-progress" | "todo"
}

export interface PRD {
  id: string
  title: string
  summary: string
  status: "active" | "queued" | "shipped"
  workItems: WorkItem[]
  completedAt?: string
}

export interface PullRequest {
  id: string
  projectSlug: string
  number: number
  title: string
  branch: string
  status: PRStatus
  checkStatus: CheckStatus
  createdAt: string
  url: string
  author: string
  unresolvedComments: number
}

export interface TimelineEvent {
  id: string
  projectSlug: string
  type: EventType
  description: string
  timestamp: string
  metadata?: Record<string, string>
}

export interface Project {
  slug: string
  name: string
  domain: string
  workflow: string
  tags: string[]
  activityLevel: ActivityLevel
  repoUrl: string
  deployUrl?: string
  openPRCount: number
  checkStatus: CheckStatus
  daysSinceActivity: number
  activePRD?: PRD
  upNextPRDs?: PRD[]
  shippedPRDs?: PRD[]
  summaryLine: string
  actionNeeded?: boolean
}
