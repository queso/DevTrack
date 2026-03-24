import { beforeEach, describe, expect, it, vi } from "vitest"

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
    findUnique: vi.fn(),
    create: vi.fn(),
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

describe("GET /api/v1/events", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should return paginated event list in envelope", async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: "ev-1",
        projectId: "proj-1",
        type: "pr_opened",
        title: "PR #1 opened",
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
    expect(body).toHaveProperty("data")
    expect(Array.isArray(body.data)).toBe(true)
    expect(body).toHaveProperty("meta")
  })

  it("should filter events by project_id query param", async () => {
    mockPrisma.event.findMany.mockResolvedValue([])
    mockPrisma.event.count.mockResolvedValue(0)

    const { GET } = await import("@/app/api/v1/events/route")
    const request = new Request("http://localhost/api/v1/events?project_id=proj-1")
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: "proj-1" }) }),
    )
  })
})

describe("GET /api/v1/events/summary", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should return daily rollup grouped by project", async () => {
    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: "ev-1",
        projectId: "proj-1",
        type: "pr_opened",
        title: "PR #1 opened",
        metadata: {},
        occurredAt: new Date("2026-03-15"),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "ev-2",
        projectId: "proj-1",
        type: "prd_completed",
        title: "PRD done",
        metadata: {},
        occurredAt: new Date("2026-03-15"),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const { GET } = await import("@/app/api/v1/events/summary/route")
    const request = new Request("http://localhost/api/v1/events/summary")
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty("data")
    // Summary groups by day and project
    expect(Array.isArray(body.data)).toBe(true)
  })
})

describe("GET /api/v1/projects/:id/events", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should return events scoped to a project", async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1" })
    mockPrisma.event.findMany.mockResolvedValue([
      {
        id: "ev-1",
        projectId: "proj-1",
        type: "branch_created",
        title: "Branch created",
        metadata: {},
        occurredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    mockPrisma.event.count.mockResolvedValue(1)

    const { GET } = await import("@/app/api/v1/projects/[id]/events/route")
    const request = new Request("http://localhost/api/v1/projects/proj-1/events")
    const response = await GET(request, { params: Promise.resolve({ id: "proj-1" }) })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty("data")
    // All events should belong to this project
    for (const event of body.data) {
      expect(event.projectId).toBe("proj-1")
    }
  })

  it("should return 404 when project does not exist", async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null)

    const { GET } = await import("@/app/api/v1/projects/[id]/events/route")
    const request = new Request("http://localhost/api/v1/projects/missing/events")
    const response = await GET(request, { params: Promise.resolve({ id: "missing" }) })

    expect(response.status).toBe(404)
  })
})
