export type PrdFrontmatterStatus = "queued" | "in-progress" | "completed"

export interface PrdFrontmatter {
  title: string
  summary: string
  status: PrdFrontmatterStatus
}

export interface PrdWorkItem {
  title: string
  completed: boolean
}

export interface ParsedPrd {
  frontmatter: PrdFrontmatter | null
  workItems: PrdWorkItem[]
}
