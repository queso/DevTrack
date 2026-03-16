import { authenticateRequest } from "@/lib/auth"
import { notFound, badRequest, unprocessableEntity, handlePrismaError } from "@/lib/api"
import { prisma } from "@/lib/db"
import { apiSuccess } from "@/lib/api/response"
import { updateContentSchema } from "@/lib/schemas"

type RouteContext = { params: Promise<{ id: string }> }

const VALID_TRANSITIONS: Record<string, string[]> = {
  idea: ["draft"],
  draft: ["published"],
  published: [],
}

export async function GET(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const { id } = await params
  const item = await prisma.contentItem.findUnique({ where: { id } })
  if (!item) return notFound("Content item not found")

  return Response.json(apiSuccess(item))
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const { id } = await params
  const existing = await prisma.contentItem.findUnique({ where: { id } })
  if (!existing) return notFound("Content item not found")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest("Invalid JSON in request body")
  }

  const parsed = updateContentSchema.safeParse(body)
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join("."), i.message]),
    )
    return unprocessableEntity(fields)
  }

  if (parsed.data.status && parsed.data.status !== existing.status) {
    const allowed = VALID_TRANSITIONS[existing.status] ?? []
    if (!allowed.includes(parsed.data.status)) {
      return unprocessableEntity({
        status: `Cannot transition from '${existing.status}' to '${parsed.data.status}'`,
      })
    }
  }

  const { project_id, source_path, published_at, ...rest } = parsed.data
  const updateData: Record<string, unknown> = {
    ...rest,
    ...(project_id !== undefined ? { projectId: project_id } : {}),
    ...(source_path !== undefined ? { sourcePath: source_path } : {}),
    ...(published_at !== undefined ? { publishedAt: published_at ? new Date(published_at) : null } : {}),
  }

  if (parsed.data.status === "published" && !existing.publishedAt) {
    updateData.publishedAt = new Date()
  }

  try {
    const item = await prisma.contentItem.update({ where: { id }, data: updateData })
    return Response.json(apiSuccess(item))
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return handled
    throw error
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const { id } = await params
  const existing = await prisma.contentItem.findUnique({ where: { id } })
  if (!existing) return notFound("Content item not found")

  try {
    await prisma.contentItem.delete({ where: { id } })
    return new Response(null, { status: 204 })
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return handled
    throw error
  }
}
