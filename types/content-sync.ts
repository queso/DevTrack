export interface ContentSyncOptions {
  projectId: string
  contentPath: string
  draftPath: string
  changedFiles: string[]
  apiUrl: string
  apiKey: string
}

export type ContentSyncEventType = "content_published" | "content_updated"

export interface ContentSyncRecord {
  filePath: string
  contentItemId: string | null
  created: boolean
  updated: boolean
  published: boolean
  eventType: ContentSyncEventType | null
  eventRecorded: boolean
}

export interface ContentSyncResult {
  synced: ContentSyncRecord[]
  skipped: string[]
}

export interface ContentItemApiPayload {
  title: string
  summary?: string
  status: "draft" | "published"
  tags?: string[]
  source_path: string
}
