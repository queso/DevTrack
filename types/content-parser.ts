export type ContentFrontmatterStatus = "draft" | "published"

export interface ContentFrontmatter {
  title: string
  summary?: string
  status: ContentFrontmatterStatus
  tags?: string[]
}

export interface ParsedContent {
  frontmatter: ContentFrontmatter | null
  sourcePath: string
  isDraft: boolean
}
