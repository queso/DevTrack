import { authenticateRequest } from "@/lib/auth"
import { notFound } from "@/lib/api"
import { prisma } from "@/lib/db"
import { paginatedResponse, parsePagination, buildPagination } from "@/lib/api/response"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const { id } = await params
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) return notFound("Project not found")

  const url = new URL(request.url)
  const { page, per_page } = parsePagination(url.searchParams)
  const { skip, take } = buildPagination(page, per_page)

  const where = { projectId: id }
  const [events, total] = await Promise.all([
    prisma.event.findMany({ where, skip, take, orderBy: { occurredAt: "desc" } }),
    prisma.event.count({ where }),
  ])

  return Response.json(paginatedResponse(events, total, page, per_page))
}
