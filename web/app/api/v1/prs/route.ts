import { buildPagination, paginatedResponse, parsePagination } from "@/lib/api/response"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/db"

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.success) return auth.response

  const url = new URL(request.url)
  const { page, per_page } = parsePagination(url.searchParams)
  const { skip, take } = buildPagination(page, per_page)

  type PrStatus =
    | "open"
    | "closed"
    | "merged"
    | "draft"
    | "review_requested"
    | "changes_requested"
    | "approved"

  const status = url.searchParams.get("status") ?? undefined
  // exclude_status (comma-separated) omits terminal states so the PR *queue*
  // shows active PRs, not a pile of merged/closed ones. An explicit `status`
  // filter takes precedence.
  const excludeStatusParam = url.searchParams.get("exclude_status") ?? undefined
  const excludeStatuses = excludeStatusParam
    ? excludeStatusParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : []

  const where = status
    ? { status: status as PrStatus }
    : excludeStatuses.length
      ? { status: { notIn: excludeStatuses as PrStatus[] } }
      : {}

  const [prs, total] = await Promise.all([
    prisma.pullRequest.findMany({
      where,
      skip,
      take,
      orderBy: { openedAt: "desc" },
      include: { project: { select: { name: true } }, branch: { select: { name: true } } },
    }),
    prisma.pullRequest.count({ where }),
  ])

  return Response.json(paginatedResponse(prs, total, page, per_page))
}
