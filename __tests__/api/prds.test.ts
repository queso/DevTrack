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
  prd: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  workItem: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  project: {
    findUnique: vi.fn(),
  },
}
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/auth", () => ({
  authenticateRequest: vi.fn(() => ({ success: true })),
}))

describe("GET /api/v1/projects/:id/prds", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should return PRD list for a project in envelope", async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1" })
    mockPrisma.prd.findMany.mockResolvedValue([
      {
        id: "prd-1",
        projectId: "proj-1",
        title: "Feature PRD",
        status: "queued",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    mockPrisma.prd.count.mockResolvedValue(1)

    const { GET } = await import("@/app/api/v1/projects/[id]/prds/route")
    const request = new Request("http://localhost/api/v1/projects/proj-1/prds")
    const response = await GET(request, { params: Promise.resolve({ id: "proj-1" }) })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty("data")
    expect(Array.isArray(body.data)).toBe(true)
  })

  it("should return 404 when project does not exist", async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null)

    const { GET } = await import("@/app/api/v1/projects/[id]/prds/route")
    const request = new Request("http://localhost/api/v1/projects/missing/prds")
    const response = await GET(request, { params: Promise.resolve({ id: "missing" }) })

    expect(response.status).toBe(404)
  })
})

describe("GET /api/v1/prds/:id/work-items", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should return work items for a PRD in envelope", async () => {
    mockPrisma.prd.findUnique.mockResolvedValue({ id: "prd-1" })
    mockPrisma.workItem.findMany.mockResolvedValue([
      {
        id: "wi-1",
        prdId: "prd-1",
        title: "Task 1",
        status: "todo",
        order: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])

    const { GET } = await import("@/app/api/v1/prds/[id]/work-items/route")
    const request = new Request("http://localhost/api/v1/prds/prd-1/work-items")
    const response = await GET(request, { params: Promise.resolve({ id: "prd-1" }) })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty("data")
    expect(Array.isArray(body.data)).toBe(true)
  })
})

describe("PATCH /api/v1/work-items/:id", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should update work item status and return updated item", async () => {
    const updated = {
      id: "wi-1",
      title: "Task 1",
      status: "in_progress",
      order: 1,
      prdId: "prd-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockPrisma.workItem.findUnique.mockResolvedValue(updated)
    mockPrisma.workItem.update.mockResolvedValue(updated)

    const { PATCH } = await import("@/app/api/v1/work-items/[id]/route")
    const request = new Request("http://localhost/api/v1/work-items/wi-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "in_progress" }),
    })
    const response = await PATCH(request, { params: Promise.resolve({ id: "wi-1" }) })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty("data")
    expect(body.data.status).toBe("in_progress")
  })

  it("should return 404 when work item does not exist", async () => {
    mockPrisma.workItem.findUnique.mockResolvedValue(null)

    const { PATCH } = await import("@/app/api/v1/work-items/[id]/route")
    const request = new Request("http://localhost/api/v1/work-items/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    })
    const response = await PATCH(request, { params: Promise.resolve({ id: "missing" }) })

    expect(response.status).toBe(404)
  })
})
