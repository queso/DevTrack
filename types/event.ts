export type EventType =
  | "pr_opened"
  | "pr_merged"
  | "pr_closed"
  | "pr_review_requested"
  | "pr_changes_requested"
  | "pr_approved"
  | "branch_created"
  | "branch_deleted"
  | "prd_created"
  | "prd_updated"
  | "prd_completed"
  | "work_item_created"
  | "work_item_completed"
  | "commit"
  | "push"
  | "session_start"
  | "session_end"
  | "pr_reviewed"
  | "prd_synced"

export interface Event {
  id: string
  projectId: string
  prdId?: string | null
  pullRequestId?: string | null
  type: EventType
  title: string
  metadata: Record<string, unknown>
  occurredAt: Date
  createdAt: Date
  updatedAt: Date
}
