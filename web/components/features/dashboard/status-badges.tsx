import { cn } from "@/lib/utils"

export type PRStatus =
  | "draft"
  | "open"
  | "reviewed"
  | "changes-requested"
  | "approved"
  | "merged"
  | "closed"
export type CheckStatus = "passing" | "failing" | "pending"

const PR_STATUS_CONFIG: Record<PRStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "text-muted-foreground bg-muted/60" },
  open: { label: "Active", className: "text-sky-400 bg-sky-400/10" },
  reviewed: { label: "In Review", className: "text-amber-400 bg-amber-400/10" },
  "changes-requested": { label: "Rev. Needed", className: "text-red-400 bg-red-400/10" },
  approved: { label: "Approved", className: "text-emerald-400 bg-emerald-400/10" },
  merged: { label: "Merged", className: "text-purple-400 bg-purple-400/10" },
  closed: { label: "Closed", className: "text-muted-foreground bg-muted/40" },
}

// Fallback for any status the server sends that isn't mapped above. A badge must
// never crash the page on an unexpected value (a `closed` PR did exactly that).
const FALLBACK_PR_STATUS = { label: "Unknown", className: "text-muted-foreground bg-muted/40" }

export function PRStatusBadge({ status, className }: { status: string; className?: string }) {
  const config = PR_STATUS_CONFIG[status as PRStatus] ?? FALLBACK_PR_STATUS
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  )
}

export function CheckStatusBadge({
  status,
  className,
}: {
  status: CheckStatus
  className?: string
}) {
  if (status === "passing") {
    return (
      <span
        className={cn("inline-flex items-center gap-1 text-[11px] text-emerald-400", className)}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
        Passing
      </span>
    )
  }
  if (status === "failing") {
    return (
      <span className={cn("inline-flex items-center gap-1 text-[11px] text-red-400", className)}>
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
        Failing
      </span>
    )
  }
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] text-amber-400", className)}>
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
      Pending
    </span>
  )
}
