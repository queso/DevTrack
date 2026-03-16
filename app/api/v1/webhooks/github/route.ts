import { createHmac, timingSafeEqual } from "node:crypto"
import type { EventType, PullRequestStatus } from "@/lib/generated/prisma/client"
import { badRequest, unauthorized, handlePrismaError } from "@/lib/api"
import { prisma } from "@/lib/db"
import { getEnv } from "@/lib/env"
import { getLogger } from "@/lib/logger"

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch (error) {
    getLogger().warn({ error: String(error), sigLen: signature.length, expectedLen: expected.length }, "Webhook signature verification error")
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
    where: { repoUrl: { endsWith: repo } },
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
  } else if (eventType === "pull_request_review") {
    await handlePullRequestReview(payload, project.id)
  } else if (eventType === "check_suite") {
    await handleCheckSuite(payload, project.id)
  }

  return Response.json({ ok: true })
}

async function handlePullRequest(payload: Record<string, unknown>, projectId: string) {
  const pr = payload.pull_request as Record<string, unknown>
  const action = payload.action as string
  const merged = !!pr.merged_at
  const githubId = pr.id as number
  const status = mapPrStatus(pr.state as string, merged)

  let mergedAt: Date | null = null
  if (merged) {
    const parsedDate = new Date(pr.merged_at as string)
    mergedAt = Number.isNaN(parsedDate.getTime()) ? null : parsedDate
  }

  try {
    await prisma.pullRequest.upsert({
      where: { projectId_githubId: { projectId, githubId } },
      create: {
        projectId,
        githubId,
        number: pr.number as number,
        title: pr.title as string,
        status: status as PullRequestStatus,
        url: pr.html_url as string,
        author: (pr.user as { login: string }).login,
        openedAt: new Date(pr.created_at as string),
        mergedAt,
      },
      update: {
        status: status as PullRequestStatus,
        mergedAt,
      },
    })
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return
    throw error
  }

  const eventType = mapPrAction(action, merged)
  const eventKey = `${eventType}:${githubId}`

  const existing = await prisma.event.findFirst({
    where: { projectId, metadata: { path: ["key"], equals: eventKey } },
  })

  if (!existing) {
    try {
      await prisma.event.create({
        data: {
          projectId,
          type: eventType as EventType,
          title: `PR #${pr.number as number}: ${pr.title as string}`,
          metadata: { key: eventKey, github_id: githubId, action },
          occurredAt: new Date(),
        },
      })
    } catch (error) {
      const handled = handlePrismaError(error)
      if (handled) return
      throw error
    }
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
      try {
        await prisma.event.create({
          data: {
            projectId,
            type: "commit",
            title: `${branch}: ${commit.message}`,
            metadata: { key: eventKey, commit_id: commit.id },
            occurredAt: new Date(),
          },
        })
      } catch (error) {
        const handled = handlePrismaError(error)
        if (handled) return
        throw error
      }
    }
  }
}

async function handleCreate(payload: Record<string, unknown>, projectId: string) {
  const refType = payload.ref_type as string
  if (refType !== "branch") return

  const name = payload.ref as string

  try {
    await prisma.branch.upsert({
      where: { projectId_name: { projectId, name } },
      create: {
        projectId,
        name,
        isActive: true,
      },
      update: { isActive: true },
    })
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return
    throw error
  }

  const eventKey = `branch_created:${projectId}:${name}`
  const existing = await prisma.event.findFirst({
    where: { projectId, metadata: { path: ["key"], equals: eventKey } },
  })

  if (!existing) {
    try {
      await prisma.event.create({
        data: {
          projectId,
          type: "branch_created",
          title: `Branch created: ${name}`,
          metadata: { key: eventKey, branch: name },
          occurredAt: new Date(),
        },
      })
    } catch (error) {
      const handled = handlePrismaError(error)
      if (handled) return
      throw error
    }
  }
}

async function handlePullRequestReview(payload: Record<string, unknown>, projectId: string) {
  const action = payload.action as string
  if (action !== "submitted") return

  const review = payload.review as Record<string, unknown>
  const pr = payload.pull_request as Record<string, unknown>
  const reviewState = review.state as string
  const githubId = pr.id as number

  const existingPr = await prisma.pullRequest.findFirst({
    where: { projectId, githubId },
  })

  if (!existingPr) return

  // Map review state to PR status and event type
  let prStatus: PullRequestStatus | null = null
  let eventType: EventType = "pr_reviewed"

  if (reviewState === "approved") {
    prStatus = "approved"
    eventType = "pr_approved"
  } else if (reviewState === "changes_requested") {
    prStatus = "changes_requested"
    eventType = "pr_changes_requested"
  }

  if (prStatus) {
    try {
      await prisma.pullRequest.update({
        where: { id: existingPr.id },
        data: { status: prStatus },
      })
    } catch (error) {
      getLogger().warn({ projectId, error }, "Failed to update PR record")
    }
  }

  const eventKey = `${eventType}:${review.id as number}`
  const existing = await prisma.event.findFirst({
    where: { projectId, metadata: { path: ["key"], equals: eventKey } },
  })

  if (!existing) {
    try {
      await prisma.event.create({
        data: {
          projectId,
          type: eventType,
          title: `PR #${pr.number as number} reviewed by ${(review.user as { login: string }).login}`,
          metadata: { key: eventKey, review_id: review.id, state: reviewState },
          occurredAt: new Date(review.submitted_at as string),
        },
      })
    } catch (error) {
      getLogger().warn({ projectId, error }, "Failed to create PR review event")
    }
  }
}

async function handleDelete(payload: Record<string, unknown>, projectId: string) {
  const refType = payload.ref_type as string
  if (refType !== "branch") return

  const name = payload.ref as string

  try {
    await prisma.branch.upsert({
      where: { projectId_name: { projectId, name } },
      create: { projectId, name, isActive: false },
      update: { isActive: false },
    })
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return
    throw error
  }

  try {
    await prisma.event.create({
      data: {
        projectId,
        type: "branch_deleted",
        title: `Branch deleted: ${name}`,
        metadata: { branch: name },
        occurredAt: new Date(),
      },
    })
  } catch (error) {
    const handled = handlePrismaError(error)
    if (handled) return
    throw error
  }
}

async function handleCheckSuite(payload: Record<string, unknown>, projectId: string) {
  const action = payload.action as string
  if (action !== "completed") return

  const suite = payload.check_suite as Record<string, unknown>
  const conclusion = suite.conclusion as string | null
  const headBranch = suite.head_branch as string

  const pr = await prisma.pullRequest.findFirst({
    where: {
      projectId,
      branch: { name: headBranch },
    },
  })

  if (!pr) return

  let checkStatus: "passing" | "failing" | null = null
  if (conclusion === "success") {
    checkStatus = "passing"
  } else if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "action_required") {
    checkStatus = "failing"
  }

  if (checkStatus) {
    try {
      await prisma.pullRequest.update({
        where: { id: pr.id },
        data: { checkStatus },
      })
    } catch (error) {
      getLogger().warn({ projectId, error }, "Failed to update PR check status")
    }
  }
}
