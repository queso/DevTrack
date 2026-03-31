import { badRequest, handlePrismaError, notFound, unprocessableEntity } from "@/lib/api"
import { apiSuccess } from "@/lib/api/response"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { updateWorkItemSchema } from "@/lib/schemas"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const { id } = await params
  const existing = await prisma.workItem.findUnique({ where: { id } })
  if (!existing) return notFound("Work item not found")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest("Invalid JSON in request body")
  }

  const parsed = updateWorkItemSchema.safeParse(body)
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]))
    return unprocessableEntity(fields)
  }

  const { prd_id, ...rest } = parsed.data
  try {
    const workItem = await prisma.workItem.update({
      where: { id },
      data: {
        ...rest,
        ...(prd_id !== undefined ? { prdId: prd_id } : {}),
      },
    })
    return Response.json(apiSuccess(workItem))
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return handled
    throw error
  }
}
