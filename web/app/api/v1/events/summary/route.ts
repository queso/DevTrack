import { apiSuccess } from "@/lib/api/response"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET(request: Request) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const url = new URL(request.url)
  const dateParam = url.searchParams.get("date")
  const targetDate = dateParam ? new Date(dateParam) : new Date()

  // Build day range
  const startOfDay = new Date(targetDate)
  startOfDay.setUTCHours(0, 0, 0, 0)
  const endOfDay = new Date(targetDate)
  endOfDay.setUTCHours(23, 59, 59, 999)

  const events = await prisma.event.findMany({
    where: {
      occurredAt: { gte: startOfDay, lte: endOfDay },
    },
    orderBy: { occurredAt: "desc" },
  })

  // Group by project and count by type
  const byProject: Record<
    string,
    { projectId: string; counts: Record<string, number>; total: number }
  > = {}

  for (const event of events) {
    if (!byProject[event.projectId]) {
      byProject[event.projectId] = { projectId: event.projectId, counts: {}, total: 0 }
    }
    const group = byProject[event.projectId]
    group.counts[event.type] = (group.counts[event.type] ?? 0) + 1
    group.total++
  }

  // Compute global day summary string
  const commitCount = events.filter((e) => e.type === "commit").length
  const projectCount = new Set(events.filter((e) => e.type === "commit").map((e) => e.projectId))
    .size
  const prMergedCount = events.filter((e) => e.type === "pr_merged").length
  const prdCompletedCount = events.filter((e) => e.type === "prd_completed").length

  const parts: string[] = []
  if (commitCount > 0) {
    parts.push(
      `${commitCount} ${commitCount === 1 ? "commit" : "commits"} across ${projectCount} ${projectCount === 1 ? "project" : "projects"}`,
    )
  }
  if (prMergedCount > 0) {
    parts.push(`${prMergedCount} ${prMergedCount === 1 ? "PR" : "PRs"} merged`)
  }
  if (prdCompletedCount > 0) {
    parts.push(`${prdCompletedCount} ${prdCompletedCount === 1 ? "PRD" : "PRDs"} completed`)
  }
  const daySummary = parts.join(", ")

  const result = Object.values(byProject).map((entry) => ({ ...entry, summary: daySummary }))

  return Response.json(apiSuccess(result))
}
