import { badRequest, handlePrismaError, notFound, unprocessableEntity } from "@/lib/api"
import { apiSuccess, buildPagination, paginatedResponse, parsePagination } from "@/lib/api/response"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createPrSchema } from "@/lib/schemas"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await authenticateRequest(request)
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
  const auth = await authenticateRequest(request)
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

  const parsed = createPrSchema.safeParse({ ...(body as object), project_id: id })
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]))
    return unprocessableEntity(fields)
  }

  const { project_id, branch_id, prd_id, github_id, check_status, opened_at, merged_at, ...rest } =
    parsed.data
  try {
    // Upsert on the (projectId, githubId) unique key so `devtrack pr-sync` is
    // re-runnable: an existing PR is updated in place rather than colliding.
    const pr = await prisma.pullRequest.upsert({
      where: { projectId_githubId: { projectId: project_id, githubId: BigInt(github_id) } },
      create: {
        ...rest,
        projectId: project_id,
        branchId: branch_id ?? null,
        prdId: prd_id ?? null,
        githubId: BigInt(github_id),
        checkStatus: check_status ?? null,
        openedAt: new Date(opened_at),
        mergedAt: merged_at ? new Date(merged_at) : null,
      },
      update: {
        ...rest,
        branchId: branch_id ?? null,
        prdId: prd_id ?? null,
        checkStatus: check_status ?? null,
        openedAt: new Date(opened_at),
        mergedAt: merged_at ? new Date(merged_at) : null,
      },
    })
    return Response.json(apiSuccess(pr), { status: 200 })
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return handled
    throw error
  }
}
