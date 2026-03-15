import { type Domain, getDomainColor } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

const DOMAIN_LABELS: Record<Domain, string> = {
  arcanelayer: "arcanelayer",
  aiteam: "aiteam",
  joshowensdev: "joshowens.dev",
  infrastructure: "infrastructure",
  wendyowensbooks: "wendyowensbooks",
}

export function DomainBadge({ domain, className }: { domain: Domain; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium",
        getDomainColor(domain),
        className
      )}
    >
      {DOMAIN_LABELS[domain]}
    </span>
  )
}
