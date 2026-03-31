/**
 * Tests for WI-002: Add domain filter to events API endpoint
 *
 * Acceptance criteria:
 * 1. GET /api/v1/events?domain=arcanelayer returns only events from projects in that domain
 * 2. Without domain param, behaviour is unchanged (all events returned)
 * 3. Unknown domain returns empty array (no error)
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
  },
  project: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
}
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/auth", () => ({
  authenticateRequest: vi.fn(() => ({ success: true })),
}))

describe("GET /api/v1/events?domain=", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  // AC1: domain param filters events to projects in that domain
  it("returns only events from projects in the specified domain", async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: "ev-1",
        projectId: "proj-arcane",
        type: "pr_opened",
        title: "PR in arcane project",
        metadata: {},
        occurredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        project: { id: "proj-arcane", domain: "arcanelayer" },
      },
    ])
    mockPrisma.event.count.mockResolvedValue(1)

    const { GET } = await import("@/app/api/v1/events/route")
    const request = new Request("http://localhost/api/v1/events?domain=arcanelayer")
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].projectId).toBe("proj-arcane")
  })

  // AC1: domain filter is passed as a constraint on the project relation
  it("queries events filtered by project domain via join", async () => {
    mockPrisma.event.findMany.mockResolvedValue([])
    mockPrisma.event.count.mockResolvedValue(0)

    const { GET } = await import("@/app/api/v1/events/route")
    const request = new Request("http://localhost/api/v1/events?domain=aiteam")
    await GET(request)

    expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          project: expect.objectContaining({ domain: "aiteam" }),
        }),
      }),
    )
  })

  // AC2: without domain param, all events are returned (unchanged behaviour)
  it("returns all events when no domain param is provided", async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: "ev-2",
        projectId: "proj-any",
        type: "branch_created",
        title: "Branch created",
        metadata: {},
        occurredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    mockPrisma.event.count.mockResolvedValue(1)

    const { GET } = await import("@/app/api/v1/events/route")
    const request = new Request("http://localhost/api/v1/events")
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toHaveLength(1)

    // When no domain param, the where clause should NOT include a project domain filter
    const whereArg = mockPrisma.event.findMany.mock.calls[0][0].where
    expect(whereArg).not.toHaveProperty("project")
  })

  // AC3: unknown domain returns empty array, not an error
  it("returns empty array for an unknown domain", async () => {
    mockPrisma.event.findMany.mockResolvedValue([])
    mockPrisma.event.count.mockResolvedValue(0)

    const { GET } = await import("@/app/api/v1/events/route")
    const request = new Request("http://localhost/api/v1/events?domain=nonexistent-domain")
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data).toEqual([])
  })
})
