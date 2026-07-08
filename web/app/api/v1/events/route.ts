import { badRequest, handlePrismaError, notFound, unprocessableEntity } from "@/lib/api"
import { apiSuccess, buildPagination, paginatedResponse, parsePagination } from "@/lib/api/response"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/db"
import type { EventType } from "@/lib/generated/prisma/client"
import { createEventSchema } from "@/lib/schemas"

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.success) return auth.response

  const url = new URL(request.url)
  const { page, per_page } = parsePagination(url.searchParams)
  const { skip, take } = buildPagination(page, per_page)

  const projectId = url.searchParams.get("project_id") ?? undefined
  const type = url.searchParams.get("type") ?? undefined
  const fromParam = url.searchParams.get("from") ?? undefined
  const toParam = url.searchParams.get("to") ?? undefined
  const domain = url.searchParams.get("domain") ?? undefined

  if (fromParam !== undefined) {
    const d = new Date(fromParam)
    if (Number.isNaN(d.getTime())) return badRequest("Invalid 'from' date")
  }
  if (toParam !== undefined) {
    const d = new Date(toParam)
    if (Number.isNaN(d.getTime())) return badRequest("Invalid 'to' date")
  }

  const from = fromParam
  const to = toParam

  const where = {
    ...(projectId ? { projectId } : {}),
    ...(type ? { type: type as EventType } : {}),
    ...(domain ? { project: { domain } } : {}),
    ...(from || to
      ? {
          occurredAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  }

  const [events, total] = await Promise.all([
    prisma.event.findMany({ where, skip, take, orderBy: { occurredAt: "desc" } }),
    prisma.event.count({ where }),
  ])

  return Response.json(paginatedResponse(events, total, page, per_page))
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.success) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest("Invalid JSON in request body")
  }

  const parsed = createEventSchema.safeParse(body)
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]))
    return unprocessableEntity(fields)
  }

  const { project_id, project_name, prd_id, pull_request_id, title, occurred_at, ...rest } =
    parsed.data
  const occurredAtDate = new Date(occurred_at)
  if (Number.isNaN(occurredAtDate.getTime())) {
    return badRequest("Invalid occurred_at timestamp")
  }

  // Resolve the project by UUID or unique name (git hooks post by name).
  let projectId = project_id
  if (!projectId && project_name) {
    const project = await prisma.project.findUnique({
      where: { name: project_name },
      select: { id: true },
    })
    if (!project) return notFound(`Project not found: ${project_name}`)
    projectId = project.id
  }
  if (!projectId) return badRequest("Either project_id or project_name is required")

  // Backfill a human-readable title from the event type when none is supplied
  // (e.g. session-start hooks record no message).
  const eventTitle = title?.trim() ? title : rest.type.replace(/_/g, " ")

  try {
    const event = await prisma.event.create({
      data: {
        ...rest,
        title: eventTitle,
        projectId,
        prdId: prd_id ?? null,
        pullRequestId: pull_request_id ?? null,
        occurredAt: occurredAtDate,
      } as any,
    })
    // Keep the project's last-activity marker current so staleness/status
    // surfaces (e.g. /status/all) reflect recorded events. Only advance it
    // forward, never backward for out-of-order/backfilled events.
    await prisma.project.updateMany({
      where: {
        id: projectId,
        OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: occurredAtDate } }],
      },
      data: { lastActivityAt: occurredAtDate },
    })
    return Response.json(apiSuccess(event), { status: 201 })
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return handled
    throw error
  }
}
