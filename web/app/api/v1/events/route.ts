import { badRequest, handlePrismaError, unprocessableEntity } from "@/lib/api"
import { apiSuccess, buildPagination, paginatedResponse, parsePagination } from "@/lib/api/response"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/db"
import type { EventType } from "@/lib/generated/prisma/client"
import { createEventSchema } from "@/lib/schemas"

export async function GET(request: Request) {
  const auth = authenticateRequest(request)
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
  const auth = authenticateRequest(request)
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

  const { project_id, prd_id, pull_request_id, occurred_at, ...rest } = parsed.data
  const occurredAtDate = new Date(occurred_at)
  if (Number.isNaN(occurredAtDate.getTime())) {
    return badRequest("Invalid occurred_at timestamp")
  }

  try {
    const event = await prisma.event.create({
      data: {
        ...rest,
        projectId: project_id,
        prdId: prd_id ?? null,
        pullRequestId: pull_request_id ?? null,
        occurredAt: occurredAtDate,
      } as any,
    })
    return Response.json(apiSuccess(event), { status: 201 })
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return handled
    throw error
  }
}
