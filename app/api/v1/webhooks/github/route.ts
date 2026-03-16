import { createHmac, timingSafeEqual } from "node:crypto"
import { badRequest, unauthorized } from "@/lib/api"
import { prisma } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { getLogger } from "@/lib/logger"

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

const PR_STATE_MAP: Record<string, string> = {
  open: "open",
  closed: "closed",
  merged: "merged",
}

function mapPrAction(action: string, merged: boolean): string {
  if (action === "closed" && merged) return "pr_merged"
  if (action === "closed") return "pr_closed"
  if (action === "opened" || action === "reopened") return "pr_opened"
  if (action === "review_requested") return "pr_review_requested"
  if (action === "changes_requested") return "pr_changes_requested"
  if (action === "approved") return "pr_approved"
  return "pr_opened"
}

function mapPrStatus(state: string, merged: boolean): string {
  if (merged) return "merged"
  return PR_STATE_MAP[state] ?? "open"
}

export async function POST(request: Request) {
  const logger = getLogger()
  const env = getEnv()

  const signature = request.headers.get("X-Hub-Signature-256")
  if (!signature) {
    return unauthorized("Missing webhook signature")
  }

  const rawBody = await request.text()

  const secret = env.GITHUB_WEBHOOK_SECRET
  if (!secret) {
    logger.warn("GITHUB_WEBHOOK_SECRET not configured")
    return unauthorized("Webhook secret not configured")
  }

  const valid = await verifySignature(rawBody, signature, secret)
  if (!valid) {
    logger.warn("Invalid webhook signature")
    return unauthorized("Invalid webhook signature")
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return badRequest("Invalid JSON payload")
  }

  const eventType = request.headers.get("X-GitHub-Event") ?? ""
  const repo = (payload.repository as { full_name?: string } | undefined)?.full_name

  if (!repo) {
    return badRequest("Missing repository in payload")
  }

  // Look up project by repo URL (match on the repo full_name)
  const project = await prisma.project.findFirst({
    where: { repoUrl: { contains: repo } },
  })

  if (!project) {
    logger.info({ repo }, "Webhook received for unknown repo, ignoring")
    return Response.json({ ok: true, ignored: true })
  }

  logger.info({ event: eventType, repo, projectId: project.id }, "Processing webhook")

  if (eventType === "pull_request") {
    await handlePullRequest(payload, project.id)
  } else if (eventType === "push") {
    await handlePush(payload, project.id)
  } else if (eventType === "create") {
    await handleCreate(payload, project.id)
  } else if (eventType === "delete") {
    await handleDelete(payload, project.id)
  }

  return Response.json({ ok: true })
}

async function handlePullRequest(payload: Record<string, unknown>, projectId: string) {
  const pr = payload.pull_request as Record<string, unknown>
  const action = payload.action as string
  const merged = !!pr.merged_at
  const githubId = pr.id as number
  const status = mapPrStatus(pr.state as string, merged)

  await prisma.pullRequest.upsert({
    where: { id: String(githubId) },
    create: {
      id: String(githubId),
      projectId,
      githubId,
      number: pr.number as number,
      title: pr.title as string,
      status: status as never,
      url: pr.html_url as string,
      author: (pr.user as { login: string }).login,
      openedAt: new Date(),
      mergedAt: merged ? new Date(pr.merged_at as string) : null,
    },
    update: {
      status: status as never,
      mergedAt: merged ? new Date(pr.merged_at as string) : null,
    },
  })

  const eventType = mapPrAction(action, merged)
  const eventKey = `${eventType}:${githubId}`

  const existing = await prisma.event.findFirst({
    where: { projectId, metadata: { path: ["key"], equals: eventKey } },
  })

  if (!existing) {
    await prisma.event.create({
      data: {
        projectId,
        type: eventType as never,
        title: `PR #${pr.number as number}: ${pr.title as string}`,
        metadata: { key: eventKey, github_id: githubId, action },
        occurredAt: new Date(),
      },
    })
  }
}

async function handlePush(payload: Record<string, unknown>, projectId: string) {
  const commits = (payload.commits as Array<{ id: string; message: string }>) ?? []
  const ref = payload.ref as string
  const branch = ref.replace("refs/heads/", "")

  for (const commit of commits) {
    const eventKey = `commit:${commit.id}`
    const existing = await prisma.event.findFirst({
      where: { projectId, metadata: { path: ["key"], equals: eventKey } },
    })

    if (!existing) {
      await prisma.event.create({
        data: {
          projectId,
          type: "commit",
          title: `${branch}: ${commit.message}`,
          metadata: { key: eventKey, commit_id: commit.id },
          occurredAt: new Date(),
        },
      })
    }
  }
}

async function handleCreate(payload: Record<string, unknown>, projectId: string) {
  const refType = payload.ref_type as string
  if (refType !== "branch") return

  const name = payload.ref as string

  await prisma.branch.upsert({
    where: { id: `${projectId}:${name}` },
    create: {
      id: `${projectId}:${name}`,
      projectId,
      name,
      isActive: true,
    },
    update: { isActive: true },
  })

  const eventKey = `branch_created:${projectId}:${name}`
  const existing = await prisma.event.findFirst({
    where: { projectId, metadata: { path: ["key"], equals: eventKey } },
  })

  if (!existing) {
    await prisma.event.create({
      data: {
        projectId,
        type: "branch_created",
        title: `Branch created: ${name}`,
        metadata: { key: eventKey, branch: name },
        occurredAt: new Date(),
      },
    })
  }
}

async function handleDelete(payload: Record<string, unknown>, projectId: string) {
  const refType = payload.ref_type as string
  if (refType !== "branch") return

  const name = payload.ref as string

  const branch = await prisma.branch.findFirst({ where: { projectId, name } })
  if (branch) {
    await prisma.branch.upsert({
      where: { id: branch.id },
      create: { projectId, name, isActive: false },
      update: { isActive: false },
    })
  }

  await prisma.event.create({
    data: {
      projectId,
      type: "branch_deleted",
      title: `Branch deleted: ${name}`,
      metadata: { branch: name },
      occurredAt: new Date(),
    },
  })
}
