import { authenticateRequest } from "@/lib/auth"
import { notFound, badRequest, unprocessableEntity, handlePrismaError } from "@/lib/api"
import { prisma } from "@/lib/db"
import { apiSuccess } from "@/lib/api/response"
import { createWorkItemSchema } from "@/lib/schemas"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const { id } = await params
  const prd = await prisma.prd.findUnique({ where: { id } })
  if (!prd) return notFound("PRD not found")

  const workItems = await prisma.workItem.findMany({
    where: { prdId: id },
    orderBy: { order: "asc" },
  })

  return Response.json(apiSuccess(workItems))
}

export async function POST(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const { id } = await params
  const prd = await prisma.prd.findUnique({ where: { id } })
  if (!prd) return notFound("PRD not found")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest("Invalid JSON in request body")
  }

  const parsed = createWorkItemSchema.safeParse({ ...body as object, prd_id: id })
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join("."), i.message]),
    )
    return unprocessableEntity(fields)
  }

  const { prd_id, ...rest } = parsed.data
  try {
    const workItem = await prisma.workItem.create({ data: { ...rest, prdId: prd_id } })
    return Response.json(apiSuccess(workItem), { status: 201 })
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return handled
    throw error
  }
}
