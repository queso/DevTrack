import { authenticateRequest } from "@/lib/auth"
import { badRequest, unprocessableEntity, handlePrismaError } from "@/lib/api"
import { prisma } from "@/lib/db"
import { apiSuccess, paginatedResponse, parsePagination, buildPagination } from "@/lib/api/response"
import { createProjectSchema } from "@/lib/schemas"

export async function GET(request: Request) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const url = new URL(request.url)
  const { page, per_page } = parsePagination(url.searchParams)
  const { skip, take } = buildPagination(page, per_page)

  const domain = url.searchParams.get("domain") ?? undefined
  const workflow = url.searchParams.get("workflow") ?? undefined
  const tags = url.searchParams.getAll("tags")

  const where = {
    ...(domain ? { domain } : {}),
    ...(workflow ? { workflow: workflow as "sdlc" | "content" } : {}),
    ...(tags.length > 0 ? { tags: { hasEvery: tags } } : {}),
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
    prisma.project.count({ where }),
  ])

  return Response.json(paginatedResponse(projects, total, page, per_page))
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

  const parsed = createProjectSchema.safeParse(body)
  if (!parsed.success) {
    const fields = Object.fromEntries(
      parsed.error.issues.map((i) => [i.path.join("."), i.message]),
    )
    return unprocessableEntity(fields)
  }

  // Map snake_case schema fields to camelCase Prisma fields
  const { repo_url, main_branch, branch_prefix, prd_path, test_pattern, content_path,
    draft_path, deploy_environment, deploy_url, deploy_health_check, ...rest } = parsed.data

  try {
    const project = await prisma.project.create({
      data: {
        ...rest,
        repoUrl: repo_url,
        mainBranch: main_branch,
        branchPrefix: branch_prefix,
        prdPath: prd_path,
        testPattern: test_pattern,
        contentPath: content_path,
        draftPath: draft_path,
        deployEnvironment: deploy_environment,
        deployUrl: deploy_url,
        deployHealthCheck: deploy_health_check,
      },
    })

    return Response.json(apiSuccess(project), { status: 201 })
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return handled
    throw error
  }
}
