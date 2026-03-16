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
  project_id: string
  branch_id?: string | null
  prd_id?: string | null
  github_id: number
  number: number
  title: string
  status: PullRequestStatus
  url: string
  author: string
  check_status?: CheckStatus | null
  opened_at: Date
  merged_at?: Date | null
  created_at: Date
  updated_at: Date
}

export interface Branch {
  id: string
  project_id: string
  prd_id?: string | null
  name: string
  is_active: boolean
  created_at: Date
  updated_at: Date
}
