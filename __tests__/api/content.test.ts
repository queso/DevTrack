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
  contentItem: {
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

describe("GET /api/v1/projects/:id/content", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should return paginated content items in envelope", async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1" })
    mockPrisma.contentItem.findMany.mockResolvedValue([
      { id: "ci-1", projectId: "proj-1", title: "Post 1", status: "idea", tags: [], createdAt: new Date(), updatedAt: new Date() },
    ])
    mockPrisma.contentItem.count.mockResolvedValue(1)

    const { GET } = await import("@/app/api/v1/projects/[id]/content/route")
    const request = new Request("http://localhost/api/v1/projects/proj-1/content")
    const response = await GET(request, { params: Promise.resolve({ id: "proj-1" }) })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty("data")
    expect(Array.isArray(body.data)).toBe(true)
    expect(body).toHaveProperty("meta")
  })

  it("should filter by status query param", async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1" })
    mockPrisma.contentItem.findMany.mockResolvedValue([])
    mockPrisma.contentItem.count.mockResolvedValue(0)

    const { GET } = await import("@/app/api/v1/projects/[id]/content/route")
    const request = new Request("http://localhost/api/v1/projects/proj-1/content?status=draft")
    const response = await GET(request, { params: Promise.resolve({ id: "proj-1" }) })

    expect(response.status).toBe(200)
    // Verify findMany was called with status filter
    expect(mockPrisma.contentItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "draft" }) }),
    )
  })
})

describe("PATCH /api/v1/content/:id (promotion)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should promote content item from idea to draft", async () => {
    const item = { id: "ci-1", status: "idea", title: "Post 1", projectId: "proj-1", tags: [], createdAt: new Date(), updatedAt: new Date() }
    mockPrisma.contentItem.findUnique.mockResolvedValue(item)
    mockPrisma.contentItem.update.mockResolvedValue({ ...item, status: "draft" })

    const { PATCH } = await import("@/app/api/v1/content/[id]/route")
    const request = new Request("http://localhost/api/v1/content/ci-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "draft" }),
    })
    const response = await PATCH(request, { params: Promise.resolve({ id: "ci-1" }) })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.status).toBe("draft")
  })

  it("should return 404 when content item does not exist", async () => {
    mockPrisma.contentItem.findUnique.mockResolvedValue(null)

    const { PATCH } = await import("@/app/api/v1/content/[id]/route")
    const request = new Request("http://localhost/api/v1/content/missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "draft" }),
    })
    const response = await PATCH(request, { params: Promise.resolve({ id: "missing" }) })

    expect(response.status).toBe(404)
  })

  it("should return 422 when promoting to invalid status transition", async () => {
    const item = { id: "ci-1", status: "idea", title: "Post 1", projectId: "proj-1", tags: [], createdAt: new Date(), updatedAt: new Date() }
    mockPrisma.contentItem.findUnique.mockResolvedValue(item)

    const { PATCH } = await import("@/app/api/v1/content/[id]/route")
    const request = new Request("http://localhost/api/v1/content/ci-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published" }), // can't skip draft
    })
    const response = await PATCH(request, { params: Promise.resolve({ id: "ci-1" }) })

    expect([400, 422]).toContain(response.status)
  })

  it("should promote content item from draft to published", async () => {
    const item = { id: "ci-1", status: "draft", title: "Post 1", projectId: "proj-1", tags: [], createdAt: new Date(), updatedAt: new Date() }
    mockPrisma.contentItem.findUnique.mockResolvedValue(item)
    mockPrisma.contentItem.update.mockResolvedValue({ ...item, status: "published", publishedAt: new Date() })

    const { PATCH } = await import("@/app/api/v1/content/[id]/route")
    const request = new Request("http://localhost/api/v1/content/ci-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    })
    const response = await PATCH(request, { params: Promise.resolve({ id: "ci-1" }) })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.status).toBe("published")
  })

  it("should reject transition from published to any other state", async () => {
    const item = { id: "ci-1", status: "published", title: "Post 1", projectId: "proj-1", tags: [], publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date() }
    mockPrisma.contentItem.findUnique.mockResolvedValue(item)

    const { PATCH } = await import("@/app/api/v1/content/[id]/route")
    const request = new Request("http://localhost/api/v1/content/ci-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "draft" }),
    })
    const response = await PATCH(request, { params: Promise.resolve({ id: "ci-1" }) })

    expect([400, 422]).toContain(response.status)
  })

  it("should reject transition to an invalid state name", async () => {
    const item = { id: "ci-1", status: "idea", title: "Post 1", projectId: "proj-1", tags: [], createdAt: new Date(), updatedAt: new Date() }
    mockPrisma.contentItem.findUnique.mockResolvedValue(item)

    const { PATCH } = await import("@/app/api/v1/content/[id]/route")
    const request = new Request("http://localhost/api/v1/content/ci-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    })
    const response = await PATCH(request, { params: Promise.resolve({ id: "ci-1" }) })

    expect([400, 422]).toContain(response.status)
  })
})

describe("DELETE /api/v1/content/:id", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should delete a content item and return 204", async () => {
    const item = { id: "ci-1", status: "idea", title: "Post 1", projectId: "proj-1", tags: [], createdAt: new Date(), updatedAt: new Date() }
    mockPrisma.contentItem.findUnique.mockResolvedValue(item)
    mockPrisma.contentItem.delete.mockResolvedValue(item)

    const { DELETE } = await import("@/app/api/v1/content/[id]/route")
    const request = new Request("http://localhost/api/v1/content/ci-1", { method: "DELETE" })
    const response = await DELETE(request, { params: Promise.resolve({ id: "ci-1" }) })

    expect(response.status).toBe(204)
  })

  it("should return 404 when content item does not exist", async () => {
    mockPrisma.contentItem.findUnique.mockResolvedValue(null)

    const { DELETE } = await import("@/app/api/v1/content/[id]/route")
    const request = new Request("http://localhost/api/v1/content/missing", { method: "DELETE" })
    const response = await DELETE(request, { params: Promise.resolve({ id: "missing" }) })

    expect(response.status).toBe(404)
  })
})
