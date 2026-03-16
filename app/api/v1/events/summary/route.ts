import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { apiSuccess } from "@/lib/api/response"

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
  const byProject: Record<string, { projectId: string; counts: Record<string, number>; total: number }> = {}

  for (const event of events) {
    if (!byProject[event.projectId]) {
      byProject[event.projectId] = { projectId: event.projectId, counts: {}, total: 0 }
    }
    const group = byProject[event.projectId]
    group.counts[event.type] = (group.counts[event.type] ?? 0) + 1
    group.total++
  }

  const summary = Object.values(byProject)

  return Response.json(apiSuccess(summary))
}
