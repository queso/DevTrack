export type WorkflowType = "sdlc" | "content"

export interface ManifestDeploy {
  environment: string
  url: string
  health_check?: string
}

export interface ManifestConfig {
  name: string
  workflow: WorkflowType
  domain: string
  owner: string
  tags?: string[]
  main_branch?: string
  branch_prefix?: string
  prd_path?: string
  test_pattern?: string
  content_path?: string
  draft_path?: string
  deploy?: ManifestDeploy
}
