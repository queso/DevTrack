import { badRequest, handlePrismaError, notFound, unprocessableEntity } from "@/lib/api"
import { apiSuccess } from "@/lib/api/response"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { updateProjectSchema } from "@/lib/schemas"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const { id } = await params
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) return notFound("Project not found")

  return Response.json(apiSuccess(project))
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = authenticateRequest(request)
  if (!auth.success) return auth.response

  const { id } = await params
  const existing = await prisma.project.findUnique({ where: { id } })
  if (!existing) return notFound("Project not found")

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest("Invalid JSON in request body")
  }

  const parsed = updateProjectSchema.safeParse(body)
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [i.path.join("."), i.message]))
    return unprocessableEntity(fields)
  }

  const {
    repo_url,
    main_branch,
    branch_prefix,
    prd_path,
    test_pattern,
    deploy_environment,
    deploy_url,
    deploy_health_check,
    ...rest
  } = parsed.data

  try {
    const project = await prisma.project.update({
      where: { id },
      data: {
        ...rest,
        ...(repo_url !== undefined ? { repoUrl: repo_url } : {}),
        ...(main_branch !== undefined ? { mainBranch: main_branch } : {}),
        ...(branch_prefix !== undefined ? { branchPrefix: branch_prefix } : {}),
        ...(prd_path !== undefined ? { prdPath: prd_path } : {}),
        ...(test_pattern !== undefined ? { testPattern: test_pattern } : {}),
        ...(deploy_environment !== undefined ? { deployEnvironment: deploy_environment } : {}),
        ...(deploy_url !== undefined ? { deployUrl: deploy_url } : {}),
        ...(deploy_health_check !== undefined ? { deployHealthCheck: deploy_health_check } : {}),
        lastActivityAt: new Date(),
      },
    })

    return Response.json(apiSuccess(project))
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
  const existing = await prisma.project.findUnique({ where: { id } })
  if (!existing) return notFound("Project not found")

  try {
    await prisma.project.delete({ where: { id } })
    return new Response(null, { status: 204 })
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return handled
    throw error
  }
}
