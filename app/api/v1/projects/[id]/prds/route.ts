import { authenticateRequest } from "@/lib/auth"
import { notFound, badRequest, unprocessableEntity } from "@/lib/api"
import { prisma } from "@/lib/db"
import { apiSuccess, paginatedResponse, parsePagination, buildPagination } from "@/lib/api/response"
import { createPrdSchema } from "@/lib/schemas"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request as never)
  if (!auth.success) return auth.response

  const { id } = await params
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) return notFound("Project not found")

  const url = new URL(request.url)
  const { page, per_page } = parsePagination(url.searchParams)
  const { skip, take } = buildPagination(page, per_page)

  const where = { projectId: id }
  const [prds, total] = await Promise.all([
    prisma.prd.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.prd.count({ where }),
  ])

  return Response.json(paginatedResponse(prds, total, page, per_page))
}

export async function POST(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request as never)
  if (!auth.success) return auth.response

  const { id } = await params
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) return notFound("Project not found")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest("Invalid JSON in request body")
  }

  const parsed = createPrdSchema.safeParse({ ...body as object, project_id: id })
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join("."), i.message]),
    )
    return unprocessableEntity(fields)
  }

  const { project_id, source_path, ...rest } = parsed.data
  const prd = await prisma.prd.create({
    data: { ...rest, projectId: project_id, sourcePath: source_path },
  })
  return Response.json(apiSuccess(prd), { status: 201 })
}
