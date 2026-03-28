export interface ManifestDeploy {
  environment: string
  url: string
  health_check?: string
}

export interface ManifestConfig {
  name: string
  workflow: "sdlc"
  domain: string
  owner: string
  tags?: string[]
  main_branch?: string
  branch_prefix?: string
  prd_path?: string
  test_pattern?: string
  deploy?: ManifestDeploy
}
