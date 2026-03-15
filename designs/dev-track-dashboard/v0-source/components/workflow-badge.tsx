import { cn } from "@/lib/utils"
import { Code, FileText } from "lucide-react"
import type { WorkflowType } from "@/lib/mock-data"

export function WorkflowBadge({ workflow, className }: { workflow: WorkflowType; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide",
        workflow === "sdlc" && "workflow-sdlc",
        workflow === "content" && "workflow-content",
        className
      )}
    >
      {workflow === "sdlc" ? (
        <Code className="w-3 h-3" aria-hidden="true" />
      ) : (
        <FileText className="w-3 h-3" aria-hidden="true" />
      )}
      {workflow}
    </span>
  )
}
