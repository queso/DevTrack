export type { PullRequest as ApiPullRequest } from "@/types/pull-request"
export type { Event as ApiEvent } from "@/types/event"

import type { PullRequest } from "@/types/pull-request"
import type { Prd, WorkItem } from "@/types/prd"

interface ApiPrdWithItems extends Prd {
  workItems: WorkItem[]
}

interface ApiContentItem {
  id: string
  project_id: string
  title: string
  summary?: string | null
  status: "idea" | "draft" | "review" | "scheduled" | "published"
  source_path?: string | null
  tags?: string[]
  published_at?: Date | null
  created_at: Date
  updated_at: Date
}

export interface ApiProject {
  id: string
  name: string
  workflow: "sdlc" | "content"
  domain: string | null
  tags: string[]
  repoUrl: string | null
  deployUrl?: string | null
  lastActivityAt: Date | null
  prds: ApiPrdWithItems[]
  pullRequests: PullRequest[]
  createdAt: Date
  updatedAt: Date
  contentItems?: ApiContentItem[]
}
