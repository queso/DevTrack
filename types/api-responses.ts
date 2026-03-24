export type { Event as ApiEvent } from "@/types/event"
export type { PullRequest as ApiPullRequest } from "@/types/pull-request"

import type { Prd, WorkItem } from "@/types/prd"
import type { PullRequest } from "@/types/pull-request"

interface ApiPrdWithItems extends Prd {
  workItems: WorkItem[]
}

export interface ApiProject {
  id: string
  name: string
  workflow: "sdlc"
  domain: string | null
  tags: string[]
  repoUrl: string | null
  deployUrl?: string | null
  lastActivityAt: Date | null
  prds: ApiPrdWithItems[]
  pullRequests: PullRequest[]
  createdAt: Date
  updatedAt: Date
}
