export type ContentItemStatus = "idea" | "draft" | "published"

export interface ContentItem {
  id: string
  project_id: string
  title: string
  summary?: string | null
  status: ContentItemStatus
  source_path?: string | null
  tags: string[]
  published_at?: Date | null
  created_at: Date
  updated_at: Date
}
