import { badRequest, handlePrismaError, unprocessableEntity } from "@/lib/api"
import { apiSuccess, buildPagination, paginatedResponse, parsePagination } from "@/lib/api/response"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/db"
import type { EventType } from "@/lib/generated/prisma/client"
import { createEventSchema } from "@/lib/schemas"

// Derives a fallback project name from a repo URL's last path segment (e.g.
// "https://github.com/acme/widgets" -> "widgets") when no project_name is
// supplied alongside repo_url.
function deriveNameFromRepoUrl(repoUrl: string | undefined): string {
  if (!repoUrl) return "unknown-project"
  const normalized = repoUrl.replace(/\/+$/, "").replace(/\.git$/, "")
  const segments = normalized.split("/")
  return segments.at(-1) || "unknown-project"
}

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

  const {
    project_id,
    project_name,
    repo_url,
    prd_id,
    pull_request_id,
    title,
    occurred_at,
    ...rest
  } = parsed.data
  const occurredAtDate = new Date(occurred_at)
  if (Number.isNaN(occurredAtDate.getTime())) {
    return badRequest("Invalid occurred_at timestamp")
  }

  // Resolve the project by UUID, repo_url, or name — finding or creating it
  // as needed. repo_url takes precedence over name so a project's history
  // never forks when its local name drifts from its registered name.
  let projectId = project_id
  if (!projectId && repo_url) {
    const project = await prisma.project.findFirst({ where: { repoUrl: repo_url } })
    if (project) projectId = project.id
  }
  if (!projectId && project_name) {
    const project = await prisma.project.findFirst({ where: { name: project_name } })
    if (project) projectId = project.id
  }
  if (!projectId) {
    try {
      const created = await prisma.project.create({
        data: {
          name: project_name ?? deriveNameFromRepoUrl(repo_url),
          ...(repo_url ? { repoUrl: repo_url } : {}),
        },
      })
      projectId = created.id
    } catch (error) {
      const handled = handlePrismaError(error)
      if (!handled) throw error

      // A concurrent request may have won the create race for the same
      // identity — re-resolve by repo_url (or name) before giving up. Only
      // attach when the winner matches our own identity; a name collision
      // with a different repo must not be wrong-attached, so it returns the
      // handled conflict response instead.
      const winner = repo_url
        ? await prisma.project.findFirst({ where: { repoUrl: repo_url } })
        : project_name
          ? await prisma.project.findFirst({ where: { name: project_name } })
          : null
      if (!winner) return handled
      projectId = winner.id
    }
  }

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
