/**
 * Tests for exclude_type on GET /api/v1/events.
 *
 * The tool_use firehose (one event per Bash command, box-wide) buries genuine
 * SDLC activity on the default timeline page. exclude_type lets the timeline
 * omit it by default so commits/pushes/sessions are visible.
 *
 * Acceptance criteria:
 * 1. exclude_type=tool_use queries with type notIn [tool_use]
 * 2. Comma-separated exclude_type omits every listed type
 * 3. An explicit type param wins over exclude_type
 * 4. No exclude_type param leaves the type constraint absent (unchanged)
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

function whereArg() {
  return mockPrisma.event.findMany.mock.calls[0][0].where
}

describe("GET /api/v1/events?exclude_type=", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockPrisma.event.findMany.mockResolvedValue([])
    mockPrisma.event.count.mockResolvedValue(0)
  })

  it("excludes a single type via type notIn", async () => {
    const { GET } = await import("@/app/api/v1/events/route")
    await GET(new Request("http://localhost/api/v1/events?exclude_type=tool_use"))

    expect(whereArg().type).toEqual({ notIn: ["tool_use"] })
  })

  it("excludes every type in a comma-separated list", async () => {
    const { GET } = await import("@/app/api/v1/events/route")
    await GET(new Request("http://localhost/api/v1/events?exclude_type=tool_use,turn_end"))

    expect(whereArg().type).toEqual({ notIn: ["tool_use", "turn_end"] })
  })

  it("lets an explicit type win over exclude_type", async () => {
    const { GET } = await import("@/app/api/v1/events/route")
    await GET(new Request("http://localhost/api/v1/events?type=commit&exclude_type=tool_use"))

    expect(whereArg().type).toBe("commit")
  })

  it("leaves the type constraint absent when neither param is given", async () => {
    const { GET } = await import("@/app/api/v1/events/route")
    await GET(new Request("http://localhost/api/v1/events"))

    expect(whereArg()).not.toHaveProperty("type")
  })
})
