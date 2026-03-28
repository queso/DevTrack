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
  pullRequest: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  branch: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  project: {
    findUnique: vi.fn(),
  },
}
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/auth", () => ({
  authenticateRequest: vi.fn(() => ({ success: true })),
}))

describe("GET /api/v1/prs", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should return paginated PR list in envelope", async () => {
    mockPrisma.pullRequest.findMany.mockResolvedValue([
      {
        id: "pr-1",
        projectId: "proj-1",
        githubId: 101,
        number: 1,
        title: "Fix bug",
        status: "open",
        url: "https://github.com/org/repo/pull/1",
        author: "dev",
        checkStatus: "passing",
        openedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    mockPrisma.pullRequest.count.mockResolvedValue(1)

    const { GET } = await import("@/app/api/v1/prs/route")
    const request = new Request("http://localhost/api/v1/prs")
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty("data")
    expect(Array.isArray(body.data)).toBe(true)
    expect(body).toHaveProperty("meta")
    expect(body.meta).toHaveProperty("total")
  })

  it("should filter by status query param", async () => {
    mockPrisma.pullRequest.findMany.mockResolvedValue([])
    mockPrisma.pullRequest.count.mockResolvedValue(0)

    const { GET } = await import("@/app/api/v1/prs/route")
    const request = new Request("http://localhost/api/v1/prs?status=open")
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(mockPrisma.pullRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "open" }) }),
    )
  })
})

describe("GET /api/v1/projects/:id/branches", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should return branch list for a project", async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1" })
    mockPrisma.branch.findMany.mockResolvedValue([
      {
        id: "br-1",
        projectId: "proj-1",
        name: "feature/thing",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    mockPrisma.branch.count.mockResolvedValue(1)

    const { GET } = await import("@/app/api/v1/projects/[id]/branches/route")
    const request = new Request("http://localhost/api/v1/projects/proj-1/branches")
    const response = await GET(request, { params: Promise.resolve({ id: "proj-1" }) })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty("data")
    expect(Array.isArray(body.data)).toBe(true)
  })

  it("should return 404 when project does not exist", async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null)

    const { GET } = await import("@/app/api/v1/projects/[id]/branches/route")
    const request = new Request("http://localhost/api/v1/projects/missing/branches")
    const response = await GET(request, { params: Promise.resolve({ id: "missing" }) })

    expect(response.status).toBe(404)
  })
})

describe("PATCH /api/v1/prs/:id", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should update PR status and return updated PR", async () => {
    const pr = {
      id: "pr-1",
      projectId: "proj-1",
      githubId: 101,
      number: 1,
      title: "Fix bug",
      status: "open",
      url: "https://github.com/org/repo/pull/1",
      author: "dev",
      checkStatus: "passing",
      openedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockPrisma.pullRequest.findUnique.mockResolvedValue(pr)
    mockPrisma.pullRequest.update.mockResolvedValue({ ...pr, status: "merged" })

    const { PATCH } = await import("@/app/api/v1/prs/[id]/route")
    const request = new Request("http://localhost/api/v1/prs/pr-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "merged" }),
    })
    const response = await PATCH(request, { params: Promise.resolve({ id: "pr-1" }) })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.status).toBe("merged")
  })
})
