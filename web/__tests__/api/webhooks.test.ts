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
  pullRequest: { upsert: vi.fn(), findFirst: vi.fn() },
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

const prPayload = {
  action: "opened",
  number: 42,
  pull_request: {
    id: 9001,
    number: 42,
    title: "Add feature",
    state: "open",
    html_url: "https://github.com/org/repo/pull/42",
    user: { login: "devuser" },
    head: { ref: "feature/add-thing" },
    merged_at: null,
  },
  repository: { full_name: "org/repo" },
}

describe("POST /api/v1/webhooks/github — signature validation", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should return 401 when X-Hub-Signature-256 is missing", async () => {
    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const request = new Request("http://localhost/api/v1/webhooks/github", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-GitHub-Event": "ping" },
      body: JSON.stringify({ zen: "hello" }),
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it("should return 401 when signature is invalid", async () => {
    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const body = JSON.stringify({ zen: "hello" })
    const request = new Request("http://localhost/api/v1/webhooks/github", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "ping",
        "X-Hub-Signature-256": "sha256=badhash",
      },
      body,
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })
})

describe("POST /api/v1/webhooks/github — PR events", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should create PullRequest and Event records on pr.opened", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ ...prPayload.pull_request, id: "pr-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-1" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const response = await POST(makeWebhookRequest(prPayload, "pull_request"))

    expect(response.status).toBe(200)
    expect(mockPrisma.pullRequest.upsert).toHaveBeenCalled()
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "pr_opened" }) }),
    )
  })

  it("should be idempotent: same event twice does not create duplicate Event records", async () => {
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.pullRequest.upsert.mockResolvedValue({ id: "pr-1" })
    // Second call: event already exists
    mockPrisma.event.findFirst.mockResolvedValue({ id: "ev-existing" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const response = await POST(makeWebhookRequest(prPayload, "pull_request"))

    expect(response.status).toBe(200)
    expect(mockPrisma.event.create).not.toHaveBeenCalled()
  })
})

describe("POST /api/v1/webhooks/github — push and branch events", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should create a commit Event on push event", async () => {
    const pushPayload = {
      ref: "refs/heads/main",
      commits: [{ id: "abc123", message: "fix: thing" }],
      repository: { full_name: "org/repo" },
    }
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-2" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const response = await POST(makeWebhookRequest(pushPayload, "push"))

    expect(response.status).toBe(200)
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "commit" }) }),
    )
  })

  it("should upsert Branch and create Event on create branch event", async () => {
    const createPayload = {
      ref: "feature/new-thing",
      ref_type: "branch",
      repository: { full_name: "org/repo" },
    }
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1" })
    mockPrisma.branch.upsert.mockResolvedValue({ id: "br-1" })
    mockPrisma.event.findFirst.mockResolvedValue(null)
    mockPrisma.event.create.mockResolvedValue({ id: "ev-3" })

    const { POST } = await import("@/app/api/v1/webhooks/github/route")
    const response = await POST(makeWebhookRequest(createPayload, "create"))

    expect(response.status).toBe(200)
    expect(mockPrisma.branch.upsert).toHaveBeenCalled()
    expect(mockPrisma.event.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "branch_created" }) }),
    )
  })
})
