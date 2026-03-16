export type PrdStatus = "queued" | "in_progress" | "completed"
export type WorkItemStatus = "todo" | "in_progress" | "done"

export interface Prd {
  id: string
  project_id: string
  title: string
  summary?: string | null
  status: PrdStatus
  source_path?: string | null
  created_at: Date
  updated_at: Date
}

export interface WorkItem {
  id: string
  prd_id: string
  title: string
  status: WorkItemStatus
  order: number
  created_at: Date
  updated_at: Date
}
