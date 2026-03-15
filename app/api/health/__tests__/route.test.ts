import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock @/lib/env before any module that imports it transitively
vi.mock("@/lib/env", () => ({
  createEnv: () => ({
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    LOG_LEVEL: "info" as const,
    SITE_URL: "http://localhost:3000",
  }),
  getEnv: () => ({
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    LOG_LEVEL: "info" as const,
    SITE_URL: "http://localhost:3000",
  }),
}))

// Mock the Prisma client singleton
const mockQueryRaw = vi.fn()
vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
  },
}))

// Mock the logger to suppress output in tests
vi.mock("@/lib/logger", () => {
  const noopLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  }
  return {
    logger: noopLogger,
    getLogger: () => noopLogger,
    createLogger: () => noopLogger,
  }
})

describe("GET /api/health", () => {
  let GET: (req?: Request) => Promise<Response>

  beforeEach(async () => {
    vi.resetModules()
    mockQueryRaw.mockReset()

    // Dynamic import so mocks are applied before the module loads
    const mod = await import("@/app/api/health/route")
    GET = mod.GET
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should return 200 with healthy status when DB is reachable", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ 1: 1 }])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe("healthy")
    expect(body.database).toBe("connected")
  })

  it("should return 503 with unhealthy status when DB query fails", async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error("Connection refused"))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toBe("SERVICE_UNAVAILABLE")
    expect(body.message).toBe("Connection refused")
    expect(body.details.status).toBe("unhealthy")
    expect(body.details.database).toBe("disconnected")
  })

  it("should include latency as a number in milliseconds", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ 1: 1 }])

    const response = await GET()
    const body = await response.json()

    expect(typeof body.latency).toBe("number")
    expect(body.latency).toBeGreaterThanOrEqual(0)
  })

  it("should include a timestamp as an ISO 8601 string", async () => {
    mockQueryRaw.mockResolvedValueOnce([{ 1: 1 }])

    const response = await GET()
    const body = await response.json()

    expect(typeof body.timestamp).toBe("string")
    // Verify it parses as a valid date and round-trips to ISO format
    const parsed = new Date(body.timestamp)
    expect(parsed.toISOString()).toBe(body.timestamp)
  })

  it("should return 503 when DB query exceeds the 5-second timeout", async () => {
    vi.useFakeTimers()

    // Simulate a query that never resolves (hangs forever)
    mockQueryRaw.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve([{ 1: 1 }]), 10_000)
        }),
    )

    const responsePromise = GET()

    // Advance time past the 5-second timeout
    await vi.advanceTimersByTimeAsync(6_000)

    const response = await responsePromise
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toBe("SERVICE_UNAVAILABLE")
    expect(body.details.status).toBe("unhealthy")
    expect(body.details.database).toBe("disconnected")
  })
})
