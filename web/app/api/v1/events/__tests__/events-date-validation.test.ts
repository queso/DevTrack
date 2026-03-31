/**
 * Tests for date validation on GET /api/v1/events
 *
 * Acceptance criteria:
 * 1. Invalid `from` date string returns 400 with an error message
 * 2. Invalid `to` date string returns 400 with an error message
 * 3. Valid ISO date strings are accepted and passed to Prisma
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
}
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }))
vi.mock("@/lib/auth", () => ({
  authenticateRequest: vi.fn(() => ({ success: true })),
}))

describe("GET /api/v1/events date validation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("returns 400 when `from` is an invalid date string", async () => {
    const { GET } = await import("@/app/api/v1/events/route")
    const request = new Request("http://localhost/api/v1/events?from=invalid-date")
    const response = await GET(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  it("returns 400 when `to` is an invalid date string", async () => {
    const { GET } = await import("@/app/api/v1/events/route")
    const request = new Request("http://localhost/api/v1/events?to=not-a-date")
    const response = await GET(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  it("returns 400 when both `from` and `to` are invalid", async () => {
    const { GET } = await import("@/app/api/v1/events/route")
    const request = new Request("http://localhost/api/v1/events?from=bad&to=also-bad")
    const response = await GET(request)

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBeDefined()
  })

  it("accepts valid ISO date strings and queries Prisma", async () => {
    mockPrisma.event.findMany.mockResolvedValue([])
    mockPrisma.event.count.mockResolvedValue(0)

    const { GET } = await import("@/app/api/v1/events/route")
    const request = new Request(
      "http://localhost/api/v1/events?from=2024-01-01T00:00:00.000Z&to=2024-12-31T23:59:59.000Z",
    )
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(mockPrisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          occurredAt: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    )
  })
})
