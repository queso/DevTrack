import { notFound } from "@/lib/api"
import { apiSuccess } from "@/lib/api/response"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/db"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const { id } = await params
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) return notFound("Project not found")

  const [activePrdCount, totalPrdCount, openPrCount] = await Promise.all([
    prisma.prd.count({ where: { projectId: id, status: "in_progress" } }),
    prisma.prd.count({ where: { projectId: id } }),
    prisma.pullRequest.count({ where: { projectId: id, status: "open" } }),
  ])

  const status = {
    project_id: id,
    active_prd_count: activePrdCount,
    total_prd_count: totalPrdCount,
    open_pr_count: openPrCount,
    last_activity_at: project.lastActivityAt,
    health: openPrCount > 10 ? "degraded" : activePrdCount > 0 ? "active" : "idle",
  }

  return Response.json(apiSuccess(status))
}
