export type PullRequestStatus =
  | "open"
  | "closed"
  | "merged"
  | "draft"
  | "review_requested"
  | "changes_requested"
  | "approved"

export type CheckStatus = "pending" | "passing" | "failing"

export interface PullRequest {
  id: string
  projectId: string
  branchId?: string | null
  prdId?: string | null
  githubId: number
  number: number
  title: string
  status: PullRequestStatus
  url: string
  author: string
  checkStatus?: CheckStatus | null
  openedAt: Date
  mergedAt?: Date | null
  createdAt: Date
  updatedAt: Date
  // Included relations (optional — present when API includes them)
  project?: { name: string }
  branch?: { name: string } | null
}

export interface Branch {
  id: string
  projectId: string
  prdId?: string | null
  name: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
