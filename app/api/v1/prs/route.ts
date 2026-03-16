import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { paginatedResponse, parsePagination, buildPagination } from "@/lib/api/response"

export async function GET(request: Request) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const url = new URL(request.url)
  const { page, per_page } = parsePagination(url.searchParams)
  const { skip, take } = buildPagination(page, per_page)

  const status = url.searchParams.get("status") ?? undefined
  const where = status ? { status: status as "open" | "closed" | "merged" | "draft" | "review_requested" | "changes_requested" | "approved" } : {}

  const [prs, total] = await Promise.all([
    prisma.pullRequest.findMany({ where, skip, take, orderBy: { openedAt: "desc" } }),
    prisma.pullRequest.count({ where }),
  ])

  return Response.json(paginatedResponse(prs, total, page, per_page))
}
