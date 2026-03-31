export type PrdStatus = "queued" | "in_progress" | "completed"
export type WorkItemStatus = "todo" | "in_progress" | "done"

export interface Prd {
  id: string
  projectId: string
  title: string
  summary?: string | null
  status: PrdStatus
  sourcePath?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface WorkItem {
  id: string
  prdId: string
  title: string
  status: WorkItemStatus
  order: number
  createdAt: Date
  updatedAt: Date
}
