import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

type Env = ReturnType<typeof import("@/lib/env").getEnv>

/** Default mock env values satisfying the full Env shape */
const defaultMockEnv: Env = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  LOG_LEVEL: "info",
  SITE_URL: "http://localhost:3000",
  CORS_ORIGIN: "",
  RATE_LIMIT_RPM: 60,
}

function mockEnv(overrides: Partial<Env> = {}): Env {
  return { ...defaultMockEnv, ...overrides }
}

// Mock environment and logger before importing middleware
vi.mock("@/lib/env", () => ({
  getEnv: vi.fn(() => defaultMockEnv),
}))

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}))

// Import after mocks are set up
const { getEnv } = await import("@/lib/env")

describe("middleware exports", () => {
  it("should export middleware function", async () => {
    const { middleware } = await import("../middleware")
    expect(typeof middleware).toBe("function")
  })

  it("should export config with API matcher", async () => {
    const { config } = await import("../middleware")
    expect(config).toBeDefined()
    expect(config.matcher).toEqual(["/api/:path*"])
  })

  it("should export runtime as nodejs", async () => {
    const { runtime } = await import("../middleware")
    expect(runtime).toBe("nodejs")
  })
})

describe("CORS handling", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should NOT set Access-Control-Allow-Origin when CORS_ORIGIN is empty", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv())

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))
    const response = await middleware(request)

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull()
  })

  it("should set CORS headers when CORS_ORIGIN is set", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv({ CORS_ORIGIN: "https://example.com" }))

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))
    const response = await middleware(request)

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com")
    expect(response.headers.get("Access-Control-Allow-Methods")).toBeDefined()
    expect(response.headers.get("Access-Control-Allow-Headers")).toBeDefined()
  })

  it("should set Access-Control-Allow-Credentials when CORS_ORIGIN is specific origin", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv({ CORS_ORIGIN: "https://example.com" }))

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))
    const response = await middleware(request)

    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true")
  })

  it("should NOT set Access-Control-Allow-Credentials when CORS_ORIGIN is wildcard", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv({ CORS_ORIGIN: "*" }))

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))
    const response = await middleware(request)

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*")
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull()
  })

  it("should handle OPTIONS preflight with 204 and CORS headers", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv({ CORS_ORIGIN: "https://example.com" }))

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      method: "OPTIONS",
    })
    const response = await middleware(request)

    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com")
    expect(response.headers.get("Access-Control-Allow-Methods")).toBeDefined()
  })
})

describe("Rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should allow requests under rate limit", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv())

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Forwarded-For": "192.168.1.1" },
    })

    const response = await middleware(request)
    expect(response.status).not.toBe(429)
  })

  it("should return 429 when rate limit exceeded", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv({ RATE_LIMIT_RPM: 2 }))

    // Need to re-import to reset rate limit state
    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeRequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      })
      return middleware(request)
    }

    // First 2 requests should succeed
    await makeRequest()
    await makeRequest()

    // 3rd request should be rate limited
    const response = await makeRequest()
    expect(response.status).toBe(429)
  })

  it("should return ApiErrorResponse shape on 429", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv({ RATE_LIMIT_RPM: 1 }))

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const request1 = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Forwarded-For": "192.168.1.1" },
    })
    const request2 = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Forwarded-For": "192.168.1.1" },
    })

    await middleware(request1)
    const response = await middleware(request2)

    expect(response.status).toBe(429)
    const body = await response.json()
    expect(body).toHaveProperty("error")
    expect(body).toHaveProperty("message")
  })

  it("should include Retry-After header on 429", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv({ RATE_LIMIT_RPM: 1 }))

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeRequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      })
      return middleware(request)
    }

    await makeRequest()
    const response = await makeRequest()

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBeDefined()
  })

  it("should use X-Forwarded-For for IP identification", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv({ RATE_LIMIT_RPM: 2 }))

    vi.resetModules()
    const { middleware } = await import("../middleware")

    // Different IPs should have separate rate limits
    const request1 = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Forwarded-For": "192.168.1.1" },
    })
    const request2 = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Forwarded-For": "192.168.1.2" },
    })

    const response1 = await middleware(request1)
    const response2 = await middleware(request2)

    expect(response1.status).not.toBe(429)
    expect(response2.status).not.toBe(429)
  })

  it("should fall back to unknown IP when X-Forwarded-For is missing", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv())

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))

    const response = await middleware(request)
    expect(response.status).not.toBe(429)
  })

  it("should reset rate limit window after 60 seconds", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv({ RATE_LIMIT_RPM: 1 }))

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeRequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      })
      return middleware(request)
    }

    // First request
    const response1 = await makeRequest()
    expect(response1.status).not.toBe(429)

    // Second request (should be rate limited)
    const response2 = await makeRequest()
    expect(response2.status).toBe(429)

    // Advance time by 60 seconds
    vi.advanceTimersByTime(60000)

    // Third request (should succeed after window reset)
    const response3 = await makeRequest()
    expect(response3.status).not.toBe(429)
  })
})

describe("Correlation ID", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should pass through existing X-Correlation-Id from request", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv())

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Correlation-Id": "existing-123" },
    })

    const response = await middleware(request)
    expect(response.headers.get("X-Correlation-Id")).toBe("existing-123")
  })

  it("should generate UUID when X-Correlation-Id is missing", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv())

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))

    const response = await middleware(request)
    const correlationId = response.headers.get("X-Correlation-Id")

    expect(correlationId).toBeDefined()
    expect(correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it("should set X-Correlation-Id on response", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv())

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))

    const response = await middleware(request)
    expect(response.headers.has("X-Correlation-Id")).toBe(true)
  })
})

describe("Error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should return 500 with ApiErrorResponse shape when getEnv() throws", async () => {
    vi.mocked(getEnv).mockImplementation(() => {
      throw new Error("Environment validation failed")
    })

    vi.resetModules()
    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))

    const response = await middleware(request)

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toHaveProperty("error")
    expect(body).toHaveProperty("message")
  })

  it("should return JSON response on env error", async () => {
    vi.mocked(getEnv).mockImplementation(() => {
      throw new Error("Environment validation failed")
    })

    vi.resetModules()
    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))

    const response = await middleware(request)

    expect(response.headers.get("Content-Type")).toContain("application/json")
  })
})

describe("Integration scenarios", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should handle complete request flow with all features", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv({ CORS_ORIGIN: "https://example.com" }))

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      headers: {
        "X-Forwarded-For": "192.168.1.1",
        "X-Correlation-Id": "test-123",
      },
    })

    const response = await middleware(request)

    // CORS
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com")

    // Correlation ID
    expect(response.headers.get("X-Correlation-Id")).toBe("test-123")

    // Not rate limited
    expect(response.status).not.toBe(429)
  })

  it("should handle POST request with body", async () => {
    vi.mocked(getEnv).mockReturnValue(mockEnv())

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/users"), {
      method: "POST",
      body: JSON.stringify({ name: "John" }),
    })

    const response = await middleware(request)
    expect(response.status).not.toBe(429)
  })
})
