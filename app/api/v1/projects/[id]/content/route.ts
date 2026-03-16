import { authenticateRequest } from "@/lib/auth"
import { notFound, badRequest, unprocessableEntity, handlePrismaError } from "@/lib/api"
import { prisma } from "@/lib/db"
import { apiSuccess, paginatedResponse, parsePagination, buildPagination } from "@/lib/api/response"
import { createContentSchema } from "@/lib/schemas"

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

  const status = url.searchParams.get("status") ?? undefined
  const where = {
    projectId: id,
    ...(status ? { status: status as "idea" | "draft" | "published" } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.contentItem.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.contentItem.count({ where }),
  ])

  return Response.json(paginatedResponse(items, total, page, per_page))
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

  const parsed = createContentSchema.safeParse({ ...body as object, project_id: id })
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join("."), i.message]),
    )
    return unprocessableEntity(fields)
  }

  const { project_id, source_path, published_at, ...rest } = parsed.data
  try {
    const item = await prisma.contentItem.create({
      data: {
        ...rest,
        projectId: project_id,
        sourcePath: source_path ?? null,
        publishedAt: published_at ? new Date(published_at) : null,
      },
    })
    return Response.json(apiSuccess(item), { status: 201 })
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return handled
    throw error
  }
}
