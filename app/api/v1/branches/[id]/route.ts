import { badRequest, handlePrismaError, notFound, unprocessableEntity } from "@/lib/api"
import { apiSuccess } from "@/lib/api/response"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { updateBranchSchema } from "@/lib/schemas"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const { id } = await params
  const branch = await prisma.branch.findUnique({ where: { id } })
  if (!branch) return notFound("Branch not found")

  return Response.json(apiSuccess(branch))
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const { id } = await params
  const existing = await prisma.branch.findUnique({ where: { id } })
  if (!existing) return notFound("Branch not found")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest("Invalid JSON in request body")
  }

  const parsed = updateBranchSchema.safeParse(body)
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]))
    return unprocessableEntity(fields)
  }

  const { project_id, prd_id, is_active, ...rest } = parsed.data
  try {
    const branch = await prisma.branch.update({
      where: { id },
      data: {
        ...rest,
        ...(project_id !== undefined ? { projectId: project_id } : {}),
        ...(prd_id !== undefined ? { prdId: prd_id } : {}),
        ...(is_active !== undefined ? { isActive: is_active } : {}),
      },
    })
    return Response.json(apiSuccess(branch))
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return handled
    throw error
  }
}
