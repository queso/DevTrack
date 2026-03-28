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
  project: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
}
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/auth", () => ({
  authenticateRequest: vi.fn(() => ({ success: true })),
}))

describe("GET /api/v1/projects", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should return paginated project list in envelope", async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      {
        id: "uuid-1",
        name: "Project A",
        workflow: "sdlc",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    mockPrisma.project.count.mockResolvedValue(1)

    const { GET } = await import("@/app/api/v1/projects/route")
    const request = new Request("http://localhost/api/v1/projects")
    const response = await GET(request)

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty("data")
    expect(Array.isArray(body.data)).toBe(true)
    expect(body).toHaveProperty("meta")
    expect(body.meta).toHaveProperty("total")
  })

  it("should return 401 when not authenticated", async () => {
    const { authenticateRequest } = await import("@/lib/auth")
    vi.mocked(authenticateRequest).mockReturnValueOnce({
      success: false,
      response: new Response(
        JSON.stringify({ error: "UNAUTHORIZED", message: "Invalid API key" }),
        { status: 401 },
      ),
    } as never)

    vi.resetModules()
    const { GET } = await import("@/app/api/v1/projects/route")
    const request = new Request("http://localhost/api/v1/projects")
    const response = await GET(request)

    expect(response.status).toBe(401)
  })
})

describe("POST /api/v1/projects", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should create a project and return 201 with envelope", async () => {
    const created = {
      id: "uuid-2",
      name: "New Project",
      workflow: "sdlc",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockPrisma.project.create.mockResolvedValue(created)

    const { POST } = await import("@/app/api/v1/projects/route")
    const request = new Request("http://localhost/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-key" },
      body: JSON.stringify({ name: "New Project", workflow: "sdlc" }),
    })
    const response = await POST(request)

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toHaveProperty("data")
    expect(body.data.name).toBe("New Project")
  })

  it("should return 422 on invalid payload", async () => {
    const { POST } = await import("@/app/api/v1/projects/route")
    const request = new Request("http://localhost/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-key" },
      body: JSON.stringify({}), // missing required fields
    })
    const response = await POST(request)

    expect([400, 422]).toContain(response.status)
  })
})

describe("GET /api/v1/projects/:id", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should return 404 when project does not exist", async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null)

    const { GET } = await import("@/app/api/v1/projects/[id]/route")
    const request = new Request("http://localhost/api/v1/projects/nonexistent-id")
    const response = await GET(request, { params: Promise.resolve({ id: "nonexistent-id" }) })

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body).toHaveProperty("error")
  })
})

describe("DELETE /api/v1/projects/:id", () => {
  beforeEach(() => vi.clearAllMocks())

  it("should delete a project and return 204", async () => {
    const project = {
      id: "uuid-1",
      name: "Project A",
      workflow: "sdlc",
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    mockPrisma.project.findUnique.mockResolvedValue(project)
    mockPrisma.project.delete.mockResolvedValue(project)

    const { DELETE } = await import("@/app/api/v1/projects/[id]/route")
    const request = new Request("http://localhost/api/v1/projects/uuid-1", { method: "DELETE" })
    const response = await DELETE(request, { params: Promise.resolve({ id: "uuid-1" }) })

    expect(response.status).toBe(204)
  })

  it("should return 404 when project does not exist", async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null)

    const { DELETE } = await import("@/app/api/v1/projects/[id]/route")
    const request = new Request("http://localhost/api/v1/projects/nonexistent-id", {
      method: "DELETE",
    })
    const response = await DELETE(request, { params: Promise.resolve({ id: "nonexistent-id" }) })

    expect(response.status).toBe(404)
  })
})
