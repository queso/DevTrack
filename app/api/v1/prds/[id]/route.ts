import { authenticateRequest } from "@/lib/auth"
import { notFound, badRequest, unprocessableEntity } from "@/lib/api"
import { prisma } from "@/lib/db"
import { apiSuccess } from "@/lib/api/response"
import { updatePrdSchema } from "@/lib/schemas"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request as never)
  if (!auth.success) return auth.response

  const { id } = await params
  const prd = await prisma.prd.findUnique({
    where: { id },
    include: { workItems: { orderBy: { order: "asc" } } },
  })
  if (!prd) return notFound("PRD not found")

  return Response.json(apiSuccess(prd))
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request as never)
  if (!auth.success) return auth.response

  const { id } = await params
  const existing = await prisma.prd.findUnique({ where: { id } })
  if (!existing) return notFound("PRD not found")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest("Invalid JSON in request body")
  }

  const parsed = updatePrdSchema.safeParse(body)
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join("."), i.message]),
    )
    return unprocessableEntity(fields)
  }

  const { project_id, source_path, ...rest } = parsed.data
  const prd = await prisma.prd.update({
    where: { id },
    data: {
      ...rest,
      ...(project_id !== undefined ? { projectId: project_id } : {}),
      ...(source_path !== undefined ? { sourcePath: source_path } : {}),
    },
  })
  return Response.json(apiSuccess(prd))
}
