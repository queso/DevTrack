import { authenticateRequest } from "@/lib/auth"
import { badRequest, unprocessableEntity } from "@/lib/api"
import { prisma } from "@/lib/db"
import { apiSuccess, paginatedResponse, parsePagination, buildPagination } from "@/lib/api/response"
import { createEventSchema } from "@/lib/schemas"

export async function GET(request: Request) {
  const auth = authenticateRequest(request as never)
  if (!auth.success) return auth.response

  const url = new URL(request.url)
  const { page, per_page } = parsePagination(url.searchParams)
  const { skip, take } = buildPagination(page, per_page)

  const projectId = url.searchParams.get("project_id") ?? undefined
  const type = url.searchParams.get("type") ?? undefined
  const from = url.searchParams.get("from") ?? undefined
  const to = url.searchParams.get("to") ?? undefined

  const where = {
    ...(projectId ? { projectId } : {}),
    ...(type ? { type: type as never } : {}),
    ...(from || to ? {
      occurredAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    } : {}),
  }

  const [events, total] = await Promise.all([
    prisma.event.findMany({ where, skip, take, orderBy: { occurredAt: "desc" } }),
    prisma.event.count({ where }),
  ])

  return Response.json(paginatedResponse(events, total, page, per_page))
}

export async function POST(request: Request) {
  const auth = authenticateRequest(request as never)
  if (!auth.success) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest("Invalid JSON in request body")
  }

  const parsed = createEventSchema.safeParse(body)
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join("."), i.message]),
    )
    return unprocessableEntity(fields)
  }

  const { project_id, prd_id, pull_request_id, occurred_at, ...rest } = parsed.data
  const event = await prisma.event.create({
    data: {
      ...rest,
      projectId: project_id,
      prdId: prd_id ?? null,
      pullRequestId: pull_request_id ?? null,
      occurredAt: new Date(occurred_at),
    },
  })
  return Response.json(apiSuccess(event), { status: 201 })
}
