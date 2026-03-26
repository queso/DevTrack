import { badRequest, handlePrismaError, notFound, unprocessableEntity } from "@/lib/api"
import { apiSuccess, buildPagination, paginatedResponse, parsePagination } from "@/lib/api/response"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createBranchSchema } from "@/lib/schemas"

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

  const isActiveParam = url.searchParams.get("is_active")
  const where = {
    projectId: id,
    ...(isActiveParam !== null ? { isActive: isActiveParam === "true" } : {}),
  }

  const [branches, total] = await Promise.all([
    prisma.branch.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.branch.count({ where }),
  ])

  return Response.json(paginatedResponse(branches, total, page, per_page))
}

export async function POST(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request)
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

  const parsed = createBranchSchema.safeParse({ ...(body as object), project_id: id })
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]))
    return unprocessableEntity(fields)
  }

  const { project_id, prd_id, is_active, ...rest } = parsed.data
  try {
    const branch = await prisma.branch.create({
      data: { ...rest, projectId: project_id, prdId: prd_id ?? null, isActive: is_active ?? true },
    })
    return Response.json(apiSuccess(branch), { status: 201 })
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return handled
    throw error
  }
}
