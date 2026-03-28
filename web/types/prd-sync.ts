import type { PrdFrontmatterStatus } from "@/types/prd-parser"

export interface PrdSyncOptions {
  projectId: string
  prdPath: string
  changedFiles: string[]
  apiUrl: string
  apiKey: string
}

export interface PrdSyncRecord {
  filePath: string
  prdId: string | null
  created: boolean
  updated: boolean
  workItemsSynced: number
  eventRecorded: boolean
}

export interface PrdSyncResult {
  synced: PrdSyncRecord[]
  skipped: string[]
}

export interface PrdApiPayload {
  title: string
  summary: string
  status: PrdFrontmatterStatus
  source_path: string
}

export interface WorkItemApiPayload {
  title: string
  status: "todo" | "done"
}
