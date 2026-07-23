/**
 * Tests for POST /api/v1/projects/:id/prs — upsert + BigInt githubId.
 *
 * `devtrack pr-sync` posts every PR on each run, so the endpoint upserts on the
 * (projectId, githubId) unique key rather than inserting (re-runnable). GitHub
 * PR ids exceed 32-bit int range, so githubId is written as a BigInt and
 * serialized back as a number.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/generated/prisma/client", () => ({
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
  PrismaClient: class {},
}))

vi.mock("@/lib/env", () => ({
  getEnv: vi.fn(() => ({
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    LOG_LEVEL: "info",
    SITE_URL: "http://localhost:3000",
    CORS_ORIGIN: "",
    RATE_LIMIT_RPM: 60,
    DEVTRACK_API_KEY: "test-key",
  })),
}))

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })),
}))

const mockPrisma = {
  project: { findUnique: vi.fn() },
  pullRequest: { upsert: vi.fn() },
}
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/auth", () => ({
  authenticateRequest: vi.fn(() => ({ success: true })),
}))

const PROJECT_ID = "11111111-1111-4111-8111-111111111111"
// A real GitHub PR id — larger than the old Int column's max (2,147,483,647).
const BIG_PR_ID = 4088980291

function body() {
  return {
    github_id: BIG_PR_ID,
    number: 21,
    title: "fix: something",
    status: "merged",
    url: "https://github.com/queso/DevTrack/pull/21",
    author: "queso",
    opened_at: "2026-07-20T06:59:17.000Z",
    merged_at: "2026-07-20T21:44:33.000Z",
  }
}

function postRequest() {
  return new Request(`http://localhost/api/v1/projects/${PROJECT_ID}/prs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body()),
  })
}

describe("POST /api/v1/projects/:id/prs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockPrisma.project.findUnique.mockResolvedValue({ id: PROJECT_ID })
  })

  it("upserts on (projectId, githubId) with a BigInt id", async () => {
    mockPrisma.pullRequest.upsert.mockResolvedValue({
      id: "pr-1",
      projectId: PROJECT_ID,
      githubId: BigInt(BIG_PR_ID),
      number: 21,
      title: "fix: something",
      status: "merged",
      url: "https://github.com/queso/DevTrack/pull/21",
      author: "queso",
    })

    const { POST } = await import("@/app/api/v1/projects/[id]/prs/route")
    const res = await POST(postRequest(), { params: Promise.resolve({ id: PROJECT_ID }) })

    expect(res.status).toBe(200)
    // The 4-billion id is written as a BigInt (would have overflowed Int).
    expect(mockPrisma.pullRequest.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_githubId: { projectId: PROJECT_ID, githubId: BigInt(BIG_PR_ID) } },
        create: expect.objectContaining({ githubId: BigInt(BIG_PR_ID) }),
      }),
    )
  })

  it("serializes the BigInt githubId back to a number in the response", async () => {
    mockPrisma.pullRequest.upsert.mockResolvedValue({
      id: "pr-1",
      projectId: PROJECT_ID,
      githubId: BigInt(BIG_PR_ID),
      number: 21,
      title: "fix: something",
      status: "merged",
      url: "https://github.com/queso/DevTrack/pull/21",
      author: "queso",
    })

    const { POST } = await import("@/app/api/v1/projects/[id]/prs/route")
    const res = await POST(postRequest(), { params: Promise.resolve({ id: PROJECT_ID }) })
    const json = await res.json()

    expect(json.data.githubId).toBe(BIG_PR_ID)
    expect(typeof json.data.githubId).toBe("number")
  })
})
