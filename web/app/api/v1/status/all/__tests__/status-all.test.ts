/**
 * Tests for GET /api/v1/status/all — the aggregated, machine-readable status
 * surface consumed by automated clients (e.g. morning-brief collectors).
 *
 * Covers: envelope shape, sdlc_state derivation, staleness bucketing, effective
 * last-activity (max of stored marker and latest event), active PRD progress,
 * open-PR listing, and auth enforcement.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
  project: {
    findMany: vi.fn(),
  },
}
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }))

const mockAuth = vi.fn(() => ({ success: true }))
vi.mock("@/lib/auth", () => ({
  authenticateRequest: () => mockAuth(),
}))

const NOW = new Date("2026-07-07T12:00:00Z")

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)
}

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "proj",
    domain: "test",
    workflow: "sdlc",
    repoPath: "/home/josh/Code/proj",
    repoUrl: "https://github.com/queso/proj",
    mainBranch: "main",
    lastActivityAt: daysAgo(0),
    prds: [],
    pullRequests: [],
    events: [],
    ...overrides,
  }
}

async function callGet(query = "") {
  const { GET } = await import("@/app/api/v1/status/all/route")
  const request = new Request(`http://localhost/api/v1/status/all${query}`, {
    headers: { "X-Api-Key": "test-key" },
  })
  return GET(request)
}

describe("GET /api/v1/status/all", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    mockAuth.mockReturnValue({ success: true })
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns a valid envelope with generated_at and project_count", async () => {
    mockPrisma.project.findMany.mockResolvedValue([makeProject()])
    const response = await callGet()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.data.project_count).toBe(1)
    expect(body.data.projects).toHaveLength(1)
    expect(typeof body.data.generated_at).toBe("string")
  })

  it("derives sdlc_state = 'building' when an in_progress PRD exists", async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      makeProject({
        prds: [
          {
            id: "00000000-0000-4000-8000-0000000000aa",
            title: "Feature X",
            summary: "Do X",
            sourcePath: "prd/x.md",
            status: "in_progress",
            workItems: [
              { status: "done" },
              { status: "in_progress" },
              { status: "todo" },
            ],
          },
        ],
      }),
    ])
    const body = await (await callGet()).json()
    const p = body.data.projects[0]
    expect(p.sdlc_state).toBe("building")
    expect(p.active_prd.work_items_total).toBe(3)
    expect(p.active_prd.work_items_done).toBe(1)
    expect(p.active_prd.progress).toBe(0.33)
    expect(p.prd_counts.in_progress).toBe(1)
  })

  it("derives sdlc_state = 'reviewing' when open PRs exist but no active PRD", async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      makeProject({
        pullRequests: [
          {
            number: 7,
            title: "feat: thing",
            url: "https://github.com/queso/proj/pull/7",
            status: "open",
            checkStatus: "passing",
            author: "josh",
            openedAt: daysAgo(1),
          },
        ],
      }),
    ])
    const body = await (await callGet()).json()
    const p = body.data.projects[0]
    expect(p.sdlc_state).toBe("reviewing")
    expect(p.open_prs.count).toBe(1)
    expect(p.open_prs.items[0].number).toBe(7)
  })

  it("derives sdlc_state = 'planned' when only queued PRDs exist", async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      makeProject({
        prds: [{ id: "x", title: "Q", summary: null, sourcePath: null, status: "queued", workItems: [] }],
      }),
    ])
    const body = await (await callGet()).json()
    expect(body.data.projects[0].sdlc_state).toBe("planned")
  })

  it("derives sdlc_state = 'idle' and staleness = 'stale' with no activity", async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      makeProject({ lastActivityAt: null, events: [] }),
    ])
    const body = await (await callGet()).json()
    const p = body.data.projects[0]
    expect(p.sdlc_state).toBe("idle")
    expect(p.staleness).toBe("stale")
    expect(p.last_activity_at).toBeNull()
    expect(p.days_since_activity).toBeNull()
    expect(p.last_event).toBeNull()
  })

  it("buckets staleness by days since last activity", async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      makeProject({ id: "00000000-0000-4000-8000-00000000000a", name: "a", lastActivityAt: daysAgo(0) }),
      makeProject({ id: "00000000-0000-4000-8000-00000000000b", name: "b", lastActivityAt: daysAgo(3) }),
      makeProject({ id: "00000000-0000-4000-8000-00000000000c", name: "c", lastActivityAt: daysAgo(10) }),
      makeProject({ id: "00000000-0000-4000-8000-00000000000d", name: "d", lastActivityAt: daysAgo(30) }),
    ])
    const body = await (await callGet()).json()
    const byName = Object.fromEntries(body.data.projects.map((p: any) => [p.name, p.staleness]))
    expect(byName.a).toBe("active")
    expect(byName.b).toBe("recent")
    expect(byName.c).toBe("aging")
    expect(byName.d).toBe("stale")
  })

  it("uses the latest event as effective last activity when newer than the marker", async () => {
    mockPrisma.project.findMany.mockResolvedValue([
      makeProject({
        lastActivityAt: daysAgo(30),
        events: [{ type: "commit", title: "recent commit", occurredAt: daysAgo(0) }],
      }),
    ])
    const body = await (await callGet()).json()
    const p = body.data.projects[0]
    expect(p.staleness).toBe("active")
    expect(p.days_since_activity).toBe(0)
    expect(p.last_event.type).toBe("commit")
    expect(p.last_event.title).toBe("recent commit")
  })

  describe("?format=summary", () => {
    it("emits a bare summary object (no data envelope)", async () => {
      mockPrisma.project.findMany.mockResolvedValue([makeProject()])
      const body = await (await callGet("?format=summary")).json()
      expect(body.collector).toBe("devtrack")
      expect(body.ok).toBe(true)
      expect(typeof body.generated_at).toBe("string")
      expect(Array.isArray(body.projects)).toBe(true)
      expect(body.data).toBeUndefined()
    })

    it("derives project slug from repo_url and maps PRs to age_days", async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        makeProject({
          repoUrl: "https://github.com/queso/content.git",
          pullRequests: [
            {
              number: 7,
              title: "feat: thing",
              url: "https://github.com/queso/content/pull/7",
              status: "open",
              checkStatus: "passing",
              author: "josh",
              openedAt: daysAgo(2),
            },
          ],
        }),
      ])
      const body = await (await callGet("?format=summary")).json()
      const p = body.projects[0]
      expect(p.project).toBe("queso/content")
      expect(p.sdlc_state).toBe("reviewing")
      expect(p.open_prs[0].age_days).toBe(2)
    })

    it("maps planned->planning and shipped for recently completed work", async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        makeProject({
          id: "00000000-0000-4000-8000-00000000000e",
          name: "planned-one",
          repoUrl: null,
          prds: [{ id: "p", title: "Q", summary: null, sourcePath: null, status: "queued", workItems: [] }],
        }),
        makeProject({
          id: "00000000-0000-4000-8000-00000000000f",
          name: "shipped-one",
          repoUrl: null,
          lastActivityAt: daysAgo(0),
          prds: [{ id: "c", title: "Done", summary: null, sourcePath: null, status: "completed", workItems: [] }],
        }),
      ])
      const body = await (await callGet("?format=summary")).json()
      const byName = Object.fromEntries(
        body.projects.map((p: any) => [p.project, p.sdlc_state]),
      )
      expect(byName["planned-one"]).toBe("planning")
      expect(byName["shipped-one"]).toBe("shipped")
    })

    it("surfaces blockers for failing PR checks", async () => {
      mockPrisma.project.findMany.mockResolvedValue([
        makeProject({
          pullRequests: [
            {
              number: 9,
              title: "flaky feature",
              url: "https://github.com/queso/proj/pull/9",
              status: "open",
              checkStatus: "failing",
              author: "josh",
              openedAt: daysAgo(1),
            },
          ],
        }),
      ])
      const body = await (await callGet("?format=summary")).json()
      expect(body.projects[0].blockers).toContain("PR #9 checks failing: flaky feature")
    })
  })

  it("returns 401-style failure from auth without calling the DB", async () => {
    const unauth = new Response("nope", { status: 401 })
    mockAuth.mockReturnValue({ success: false, response: unauth } as never)
    const response = await callGet()
    expect(response.status).toBe(401)
    expect(mockPrisma.project.findMany).not.toHaveBeenCalled()
  })
})
