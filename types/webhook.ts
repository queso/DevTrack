export interface GitHubRepository {
  full_name: string
  html_url?: string
}

export interface GitHubUser {
  login: string
}

export interface GitHubCommit {
  id: string
  message: string
  timestamp?: string
}

export interface GitHubPullRequest {
  id: number
  number: number
  title: string
  state: string
  html_url: string
  user: GitHubUser
  head: { ref: string }
  merged_at: string | null
}

export interface GitHubPullRequestPayload {
  action: string
  number: number
  pull_request: GitHubPullRequest
  repository: GitHubRepository
}

export interface GitHubPushPayload {
  ref: string
  commits: GitHubCommit[]
  repository: GitHubRepository
}

export interface GitHubCreatePayload {
  ref: string
  ref_type: "branch" | "tag"
  repository: GitHubRepository
}

export interface GitHubDeletePayload {
  ref: string
  ref_type: "branch" | "tag"
  repository: GitHubRepository
}

export type GitHubReviewState = "approved" | "changes_requested" | "commented" | "dismissed"

export interface GitHubReview {
  id: number
  state: GitHubReviewState
  user: GitHubUser
  body: string | null
  submitted_at: string
}

export interface GitHubPullRequestReviewPayload {
  action: "submitted" | "edited" | "dismissed"
  review: GitHubReview
  pull_request: GitHubPullRequest
  repository: GitHubRepository
}

export type GitHubCheckSuiteConclusion =
  | "success"
  | "failure"
  | "neutral"
  | "cancelled"
  | "skipped"
  | "timed_out"
  | "action_required"
  | null

export interface GitHubCheckSuite {
  id: number
  head_branch: string
  conclusion: GitHubCheckSuiteConclusion
  status: string
}

export interface GitHubCheckSuitePayload {
  action: "completed" | "requested" | "rerequested"
  check_suite: GitHubCheckSuite
  repository: GitHubRepository
}
