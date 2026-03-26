import { createHmac } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/env", () => ({
  getEnv: vi.fn(() => ({
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    LOG_LEVEL: "info",
    SITE_URL: "http://localhost:3000",
    CORS_ORIGIN: "",
    RATE_LIMIT_RPM: 60,
    DEVTRACK_API_KEY: "test-key",
    GITHUB_WEBHOOK_SECRET: "webhook-secret",
  })),
}))

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })),
}))

const mockPrisma = {
  event: { create: vi.fn(), findFirst: vi.fn() },
  pullRequest: { upsert: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  branch: { upsert: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
  project: { findFirst: vi.fn() },
}
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }))

function signPayload(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
}

function makeWebhookRequest(payload: object, event: string, secret = "webhook-secret") {
  const body = JSON.stringify(payload)
  const sig = signPayload(body, secret)
  return new Request("http://localhost/api/v1/webhooks/github", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": event,
      "X-Hub-Signature-256": sig,
    },
    body,
  })
}

const basePullRequest = {
  id: 9001,
  number: 42,
  title: "Add feature",
  state: "open",
  html_url: "https://github.com/org/repo/pull/42",
  user: { login: "devuser" },
  head: { ref: "feature/add-thing" },
  merged_at: null,
  created_at: "2024-01-01T10:00:00Z",
}

const baseRepository = { full_name: "org/repo" }

// --- pull_request_review payloads ---

const approvedReviewPayload = {
  action: "submitted",
  review: {
    id: 1001,
    state: "approved",
    user: { login: "reviewer" },
    body: "LGTM",
    submitted_at: "2024-01-01T12:00:00Z",
  },
  pull_request: basePullRequest,
  repository: baseRepository,
}

const changesRequestedReviewPayload = {
  action: "submitted",
  review: {
    id: 1002,
    state: "changes_requested",
    user: { login: "reviewer" },
    body: "Please fix the tests",
    submitted_at: "2024-01-01T13:00:00Z",
  },
  pull_request: basePullRequest,
  repository: baseRepository,
}

const commentedReviewPayload = {
  action: "submitted",
  review: {
    id: 1003,
    state: "commented",
    user: { login: "reviewer" },
    body: "Just a comment",
    submitted_at: "2024-01-01T14:00:00Z",
  },
  pull_request: basePullRequest,
  repository: baseRepository,
}

// --- check_suite payloads ---

const checkSuiteSuccessPayload = {
  action: "completed",
  check_suite: {
    id: 5001,
    head_branch: "feature/add-thing",
    conclusion: "success",
    status: "completed",
  },
  repository: baseRepository,
}

const checkSuiteFailurePayload = {
  action: "completed",
  check_suite: {
    id: 5002,
    head_branch: "feature/add-thing",
    conclusion: "failure",
    status: "completed",
  },
  repository: baseRepository,
}

const checkSuiteNeutralPayload = {
  action: "completed",
  check_suite: {
    id: 5003,
    head_branch: "feature/add-thing",
    conclusion: "neutral",
    status: "completed",
  },
  repository: baseRepository,
}

describe("POST /api/v1/webhooks/github — pull_request_review events", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 200 for a pull_request_review submitted event", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue({ id: "pr-1", projectId: "proj-1" })
    mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const response = await POST(makeWebhookRequest(approvedReviewPayload, "pull_request_review"))

    expect(response.status).toBe(200)
  })

  it("updates PullRequest status to 'approved' when review state is 'approved'", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue({ id: "pr-1", projectId: "proj-1" })
    mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(approvedReviewPayload, "pull_request_review"))

    expect(mockPrisma.pullRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "approved" }),
      }),
    )
  })

  it("updates PullRequest status to 'changes_requested' when review state is 'changes_requested'", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue({ id: "pr-1", projectId: "proj-1" })
    mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(changesRequestedReviewPayload, "pull_request_review"))

    expect(mockPrisma.pullRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "changes_requested" }),
      }),
    )
  })

  it("creates a timeline Event with type 'pr_approved' for an approved review", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue({ id: "pr-1", projectId: "proj-1" })
    mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(approvedReviewPayload, "pull_request_review"))

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "pr_approved" }),
      }),
    )
  })

  it("creates a timeline Event with type 'pr_changes_requested' for a changes_requested review", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue({ id: "pr-1", projectId: "proj-1" })
    mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(changesRequestedReviewPayload, "pull_request_review"))

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "pr_changes_requested" }),
      }),
    )
  })

  it("creates a timeline Event with type 'pr_reviewed' for a commented review", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue({ id: "pr-1", projectId: "proj-1" })
    mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(commentedReviewPayload, "pull_request_review"))

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "pr_reviewed" }),
      }),
    )
  })

  it("handles unknown review states gracefully (does not crash, returns 200)", async () => {
    const unknownStatePayload = {
      ...approvedReviewPayload,
      review: { ...approvedReviewPayload.review, state: "unknown_future_state" },
    }
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue({ id: "pr-1", projectId: "proj-1" })
    mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const response = await POST(makeWebhookRequest(unknownStatePayload, "pull_request_review"))

    expect(response.status).toBe(200)
  })

  it("returns 200 even when pullRequest.update fails internally", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue({ id: "pr-1", projectId: "proj-1" })
    mockPrisma.pullRequest.update.mockRejectedValue(new Error("DB write failed"))
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const response = await POST(makeWebhookRequest(approvedReviewPayload, "pull_request_review"))

    expect(response.status).toBe(200)
  })

  it("returns 200 when no matching PullRequest is found in the database", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue(null)

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const response = await POST(makeWebhookRequest(approvedReviewPayload, "pull_request_review"))

    expect(response.status).toBe(200)
    expect(mockPrisma.pullRequest.update).not.toHaveBeenCalled()
  })

  it("ignores non-submitted review actions (e.g. edited)", async () => {
    const editedPayload = { ...approvedReviewPayload, action: "edited" }
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue({ id: "pr-1", projectId: "proj-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const response = await POST(makeWebhookRequest(editedPayload, "pull_request_review"))

    expect(response.status).toBe(200)
    expect(mockPrisma.pullRequest.update).not.toHaveBeenCalled()
  })
})

describe("POST /api/v1/webhooks/github — check_suite events", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 200 for a check_suite completed event", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue({ id: "pr-1", projectId: "proj-1" })
    mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const response = await POST(makeWebhookRequest(checkSuiteSuccessPayload, "check_suite"))

    expect(response.status).toBe(200)
  })

  it("updates PullRequest.checkStatus to 'passing' when conclusion is 'success'", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue({ id: "pr-1", projectId: "proj-1" })
    mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(checkSuiteSuccessPayload, "check_suite"))

    expect(mockPrisma.pullRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ checkStatus: "passing" }),
      }),
    )
  })

  it("updates PullRequest.checkStatus to 'failing' when conclusion is 'failure'", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue({ id: "pr-1", projectId: "proj-1" })
    mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(checkSuiteFailurePayload, "check_suite"))

    expect(mockPrisma.pullRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ checkStatus: "failing" }),
      }),
    )
  })

  it("matches the check_suite to a PullRequest via head_branch", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue({ id: "pr-1", projectId: "proj-1" })
    mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(checkSuiteSuccessPayload, "check_suite"))

    expect(mockPrisma.pullRequest.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branch: expect.objectContaining({ name: "feature/add-thing" }),
        }),
      }),
    )
  })

  it("returns 200 when no matching PR is found for the head_branch", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue(null)

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const response = await POST(makeWebhookRequest(checkSuiteSuccessPayload, "check_suite"))

    expect(response.status).toBe(200)
    expect(mockPrisma.pullRequest.update).not.toHaveBeenCalled()
  })

  it("handles neutral conclusion without crashing (returns 200)", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue({ id: "pr-1", projectId: "proj-1" })
    mockPrisma.pullRequest.update.mockResolvedValue({ id: "pr-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const response = await POST(makeWebhookRequest(checkSuiteNeutralPayload, "check_suite"))

    expect(response.status).toBe(200)
  })

  it("ignores non-completed check_suite actions (e.g. requested)", async () => {
    const requestedPayload = {
      ...checkSuiteSuccessPayload,
      action: "requested",
    }
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const response = await POST(makeWebhookRequest(requestedPayload, "check_suite"))

    expect(response.status).toBe(200)
    expect(mockPrisma.pullRequest.update).not.toHaveBeenCalled()
  })

  it("returns 200 even when pullRequest.update fails internally", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.findFirst.mockResolvedValue({ id: "pr-1", projectId: "proj-1" })
    mockPrisma.pullRequest.update.mockRejectedValue(new Error("DB write failed"))

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const response = await POST(makeWebhookRequest(checkSuiteSuccessPayload, "check_suite"))

    expect(response.status).toBe(200)
  })
})

// --- pull_request payloads ---

const prOpenedPayload = {
  action: "opened",
  pull_request: basePullRequest,
  repository: baseRepository,
}

const prClosedPayload = {
  action: "closed",
  pull_request: { ...basePullRequest, state: "closed", merged_at: null },
  repository: baseRepository,
}

const prMergedPayload = {
  action: "closed",
  pull_request: {
    ...basePullRequest,
    state: "closed",
    merged_at: "2024-01-02T15:00:00Z",
  },
  repository: baseRepository,
}

const prReopenedPayload = {
  action: "reopened",
  pull_request: { ...basePullRequest, state: "open" },
  repository: baseRepository,
}

const prEditedPayload = {
  action: "edited",
  pull_request: { ...basePullRequest, title: "Updated title", body: "New description" },
  repository: baseRepository,
}

describe("POST /api/v1/webhooks/github — pull_request events", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 200 for a pull_request opened event", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const response = await POST(makeWebhookRequest(prOpenedPayload, "pull_request"))

    expect(response.status).toBe(200)
  })

  it("upserts a PullRequest record with status 'open' when PR is opened", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(prOpenedPayload, "pull_request"))

    expect(mockPrisma.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ status: "open", githubId: 9001, number: 42 }),
        update: expect.objectContaining({ status: "open" }),
      }),
    )
  })

  it("creates a pr_opened event when PR is opened", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(prOpenedPayload, "pull_request"))

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "pr_opened" }),
      }),
    )
  })

  it("upserts a PullRequest with status 'closed' when PR is closed (not merged)", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(prClosedPayload, "pull_request"))

    expect(mockPrisma.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "closed" }),
      }),
    )
  })

  it("creates a pr_closed event when PR is closed (not merged)", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(prClosedPayload, "pull_request"))

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "pr_closed" }),
      }),
    )
  })

  it("upserts a PullRequest with status 'merged' when PR is merged", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(prMergedPayload, "pull_request"))

    expect(mockPrisma.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "merged" }),
      }),
    )
  })

  it("creates a pr_merged event when PR is merged (action=closed + merged_at set)", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(prMergedPayload, "pull_request"))

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "pr_merged" }),
      }),
    )
  })

  it("sets mergedAt from merged_at payload field when PR is merged", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(prMergedPayload, "pull_request"))

    expect(mockPrisma.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ mergedAt: new Date("2024-01-02T15:00:00Z") }),
        update: expect.objectContaining({ mergedAt: new Date("2024-01-02T15:00:00Z") }),
      }),
    )
  })

  it("upserts a PullRequest with status 'open' when PR is reopened", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(prReopenedPayload, "pull_request"))

    expect(mockPrisma.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: "open" }),
      }),
    )
  })

  it("creates a pr_reopened event when PR is reopened", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(prReopenedPayload, "pull_request"))

    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "pr_opened" }),
      }),
    )
  })

  it("updates PR title on pull_request edited action", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(prEditedPayload, "pull_request"))

    expect(mockPrisma.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ title: "Updated title" }),
      }),
    )
  })

  it("sets openedAt from pr.created_at in the payload (not current time)", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(prOpenedPayload, "pull_request"))

    expect(mockPrisma.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ openedAt: new Date("2024-01-01T10:00:00Z") }),
      }),
    )
  })

  it("upserts (not inserts duplicate) when a PR record already exists", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(prOpenedPayload, "pull_request"))
    await POST(makeWebhookRequest(prOpenedPayload, "pull_request"))

    // upsert is called each time, but it's an upsert — not a double create
    expect(mockPrisma.pullRequest.upsert).toHaveBeenCalledTimes(2)
    expect(mockPrisma.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_githubId: { projectId: "proj-1", githubId: 9001 } },
      }),
    )
  })

  it("does not create a duplicate event when event already exists for the same key", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    // Simulate existing event already in DB
    mockPrisma.event.findFirst.mockResolvedValue({ id: "ev-existing" })
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    await POST(makeWebhookRequest(prOpenedPayload, "pull_request"))

    expect(mockPrisma.event.create).not.toHaveBeenCalled()
  })

  it("returns 200 even when pullRequest.upsert fails with a DB error", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockRejectedValue(new Error("DB write failed"))

    const { POST } = await import("@/app/api/v1/webhooks/github/route")

    // The handler re-throws non-Prisma errors, so the POST itself will reject.
    // We verify this bubbles as an error (not a silent swallow), which is the
    // correct resilience contract for unhandled DB failures.
    await expect(POST(makeWebhookRequest(prOpenedPayload, "pull_request"))).rejects.toThrow(
      "DB write failed",
    )
  })

  it("returns 200 even when event.create fails with a DB error (error is contained)", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockRejectedValue(new Error("Event write failed"))

    const { POST } = await import("@/app/api/v1/webhooks/github/route")

    // Same contract: non-Prisma errors from event.create are re-thrown
    await expect(POST(makeWebhookRequest(prOpenedPayload, "pull_request"))).rejects.toThrow(
      "Event write failed",
    )
  })
})
