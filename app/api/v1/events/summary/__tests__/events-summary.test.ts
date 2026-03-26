/**
 * Tests for WI-003: Add human-readable summary to events summary endpoint
 *
 * Acceptance criteria:
 * 1. Response includes a `summary` string per day
 * 2. Summary format: "{N} commits across {M} projects, {N} PRs merged, {N} PRDs completed"
 * 3. Zero-count items are omitted from the summary string
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
  event: {
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
  project: {
    findUnique: vi.fn(),
  },
}
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/auth", () => ({
  authenticateRequest: vi.fn(() => ({ success: true })),
}))

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "ev-1",
    projectId: "proj-1",
    type: "commit",
    title: "Pushed commits",
    metadata: {},
    occurredAt: new Date("2026-03-15T10:00:00Z"),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe("GET /api/v1/events/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  // AC1: Response includes a summary string per day
  it("includes a summary string in each day entry", async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      makeEvent({ type: "commit", projectId: "proj-1" }),
      makeEvent({ type: "commit", projectId: "proj-2" }),
      makeEvent({ type: "pr_merged", projectId: "proj-1" }),
    ])

    const { GET } = await import("@/app/api/v1/events/summary/route")
    const request = new Request("http://localhost/api/v1/events/summary?date=2026-03-15")
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body.data)).toBe(true)

    // Every day entry must have a summary string
    for (const day of body.data) {
      expect(day).toHaveProperty("summary")
      expect(typeof day.summary).toBe("string")
      expect(day.summary.length).toBeGreaterThan(0)
    }
  })

  // AC2: Summary string contains correct counts
  it("formats summary with commits, projects, and merged PRs", async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      makeEvent({ id: "ev-1", type: "commit", projectId: "proj-1" }),
      makeEvent({ id: "ev-2", type: "commit", projectId: "proj-2" }),
      makeEvent({ id: "ev-3", type: "pr_merged", projectId: "proj-1" }),
    ])

    const { GET } = await import("@/app/api/v1/events/summary/route")
    const request = new Request("http://localhost/api/v1/events/summary?date=2026-03-15")
    const response = await GET(request)

    const body = await response.json()
    expect(response.status).toBe(200)

    const _day = body.data[0] ?? body.data
    const summary = Array.isArray(body.data)
      ? (body.data[0]?.summary ?? body.data.summary)
      : body.data.summary

    // Should mention 2 commits and 2 projects
    expect(summary).toMatch(/2 commit/i)
    expect(summary).toMatch(/2 project/i)
    // Should mention 1 PR merged
    expect(summary).toMatch(/1 pr merged/i)
  })

  // AC3: Zero-count items are omitted from summary
  it("omits zero-count items from summary string", async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      makeEvent({ type: "prd_completed", projectId: "proj-1" }),
    ])

    const { GET } = await import("@/app/api/v1/events/summary/route")
    const request = new Request("http://localhost/api/v1/events/summary?date=2026-03-15")
    const response = await GET(request)

    const body = await response.json()
    expect(response.status).toBe(200)

    const summary = Array.isArray(body.data) ? body.data[0]?.summary : body.data?.summary

    // Should mention PRD completed
    expect(summary).toMatch(/1 prd/i)
    // Should NOT mention commits (zero)
    expect(summary).not.toMatch(/commit/i)
    // Should NOT mention PR merged (zero)
    expect(summary).not.toMatch(/pr merged/i)
  })

  // AC1 + existing: raw counts are still present alongside summary
  it("still includes raw project counts alongside the summary field", async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      makeEvent({ type: "commit", projectId: "proj-1" }),
    ])

    const { GET } = await import("@/app/api/v1/events/summary/route")
    const request = new Request("http://localhost/api/v1/events/summary?date=2026-03-15")
    const response = await GET(request)

    const body = await response.json()
    expect(response.status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)

    // Each entry should have both projectId/counts AND the new summary
    const entry = body.data[0]
    expect(entry).toHaveProperty("summary")
    expect(entry).toHaveProperty("projectId")
  })
})
