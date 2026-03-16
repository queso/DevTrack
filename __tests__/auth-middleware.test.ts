import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Env = ReturnType<typeof import("@/lib/env").getEnv>

const defaultMockEnv: Env = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  LOG_LEVEL: "info",
  SITE_URL: "http://localhost:3000",
  CORS_ORIGIN: "",
  RATE_LIMIT_RPM: 60,
  DEVTRACK_API_KEY: "test-secret-key",
}

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

const { getEnv } = await import("@/lib/env")

describe("authenticateRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getEnv).mockReturnValue(defaultMockEnv)
  })

  it("should succeed with a valid Bearer token", async () => {
    const { authenticateRequest } = await import("@/lib/auth")
    const request = new NextRequest(new URL("http://localhost/api/v1/projects"), {
      headers: { Authorization: "Bearer test-secret-key" },
    })

    const result = authenticateRequest(request)

    expect(result.success).toBe(true)
  })

  it("should return 401 when Authorization header is missing", async () => {
    const { authenticateRequest } = await import("@/lib/auth")
    const request = new NextRequest(new URL("http://localhost/api/v1/projects"))

    const result = authenticateRequest(request)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(401)
      const body = await result.response.json()
      expect(body).toHaveProperty("error")
      expect(body).toHaveProperty("message")
    }
  })

  it("should return 401 when API key is invalid", async () => {
    const { authenticateRequest } = await import("@/lib/auth")
    const request = new NextRequest(new URL("http://localhost/api/v1/projects"), {
      headers: { Authorization: "Bearer wrong-key" },
    })

    const result = authenticateRequest(request)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(401)
    }
  })

  it("should return 401 for non-Bearer scheme", async () => {
    const { authenticateRequest } = await import("@/lib/auth")
    const request = new NextRequest(new URL("http://localhost/api/v1/projects"), {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    })

    const result = authenticateRequest(request)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.response.status).toBe(401)
    }
  })
})

describe("unprocessableEntity helper", () => {
  it("should export unprocessableEntity from lib/api and return 422", async () => {
    const { unprocessableEntity } = await import("@/lib/api")

    const response = unprocessableEntity({ name: "must not be blank", slug: "already taken" })

    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body).toHaveProperty("error")
    expect(body).toHaveProperty("message")
    expect(body.fields ?? body.details).toMatchObject({
      name: "must not be blank",
      slug: "already taken",
    })
  })
})
