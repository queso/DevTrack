import { badRequest, handlePrismaError, notFound, unprocessableEntity } from "@/lib/api"
import { apiSuccess } from "@/lib/api/response"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { updatePrSchema } from "@/lib/schemas"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const { id } = await params
  const pr = await prisma.pullRequest.findUnique({ where: { id } })
  if (!pr) return notFound("Pull request not found")

  return Response.json(apiSuccess(pr))
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const { id } = await params
  const existing = await prisma.pullRequest.findUnique({ where: { id } })
  if (!existing) return notFound("Pull request not found")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest("Invalid JSON in request body")
  }

  const parsed = updatePrSchema.safeParse(body)
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]))
    return unprocessableEntity(fields)
  }

  const { project_id, branch_id, prd_id, github_id, check_status, opened_at, merged_at, ...rest } =
    parsed.data
  try {
    const pr = await prisma.pullRequest.update({
      where: { id },
      data: {
        ...rest,
        ...(project_id !== undefined ? { projectId: project_id } : {}),
        ...(branch_id !== undefined ? { branchId: branch_id } : {}),
        ...(prd_id !== undefined ? { prdId: prd_id } : {}),
        ...(github_id !== undefined ? { githubId: github_id } : {}),
        ...(check_status !== undefined ? { checkStatus: check_status } : {}),
        ...(opened_at !== undefined ? { openedAt: new Date(opened_at) } : {}),
        ...(merged_at !== undefined ? { mergedAt: merged_at ? new Date(merged_at) : null } : {}),
      },
    })
    return Response.json(apiSuccess(pr))
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return handled
    throw error
  }
}
