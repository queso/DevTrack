import { authenticateRequest } from "@/lib/auth"
import { notFound, badRequest, unprocessableEntity } from "@/lib/api"
import { prisma } from "@/lib/db"
import { apiSuccess, paginatedResponse, parsePagination, buildPagination } from "@/lib/api/response"
import { createPrSchema } from "@/lib/schemas"

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
  const [prs, total] = await Promise.all([
    prisma.pullRequest.findMany({ where, skip, take, orderBy: { openedAt: "desc" } }),
    prisma.pullRequest.count({ where }),
  ])

  return Response.json(paginatedResponse(prs, total, page, per_page))
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

  const parsed = createPrSchema.safeParse({ ...body as object, project_id: id })
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join("."), i.message]),
    )
    return unprocessableEntity(fields)
  }

  const { project_id, branch_id, prd_id, github_id, check_status, opened_at, merged_at, ...rest } = parsed.data
  const pr = await prisma.pullRequest.create({
    data: {
      ...rest,
      projectId: project_id,
      branchId: branch_id ?? null,
      prdId: prd_id ?? null,
      githubId: github_id,
      checkStatus: check_status ?? null,
      openedAt: new Date(opened_at),
      mergedAt: merged_at ? new Date(merged_at) : null,
    },
  })
  return Response.json(apiSuccess(pr), { status: 201 })
}
