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
