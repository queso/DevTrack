/**
 * Tests for WI-628: SWR data hooks for API consumption
 *
 * These tests verify the hooks file at lib/hooks.ts (to be implemented).
 * They cover all acceptance criteria:
 * 1. Each hook returns typed data matching API response shapes
 * 2. Fetcher unwraps ApiEnvelope and throws on error
 * 3. API key header sent on every request
 * 4. Pagination params passed as query string
 * 5. SWR global config set to 30s refreshInterval as fallback
 * 6. Error states properly surfaced
 * 7. Hooks are composable (can override SWR options per-call)
 * 8. Consistent SWR cache keys so reactiveSWR can target them
 */

import { renderHook, waitFor } from "@testing-library/react"
import { createElement, type ReactNode } from "react"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ApiEnvelope, PaginationMeta } from "@/types/api"

// ---------------------------------------------------------------------------
// Types mirroring what the hooks will expose
// ---------------------------------------------------------------------------

interface Project {
  id: string
  name: string
  slug: string
  domain?: string | null
  workflow?: string | null
  tags: string[]
  repoUrl?: string | null
  createdAt: Date
  updatedAt: Date
}

interface PullRequest {
  id: string
  projectId: string
  number: number
  title: string
  status: string
  url: string
  author: string
  openedAt: Date
  createdAt: Date
  updatedAt: Date
}

interface Event {
  id: string
  projectId: string
  type: string
  title: string
  metadata: Record<string, unknown>
  occurredAt: Date
  createdAt: Date
  updatedAt: Date
}

interface ProjectStatus {
  project_id: string
  active_prd_count: number
  total_prd_count: number
  open_pr_count: number
  last_activity_at: Date | null
  health: "active" | "idle" | "degraded"
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_KEY = "test-api-key-123"

function makeEnvelope<T>(data: T, meta?: PaginationMeta): ApiEnvelope<T> {
  return meta ? { data, meta } : { data }
}

function makePaginatedEnvelope<T>(
  data: T[],
  total = data.length,
  page = 1,
  per_page = 20,
): ApiEnvelope<T[]> {
  return { data, meta: { total, page, per_page } }
}

/** Wraps the hook under a fresh SWRConfig so tests are fully isolated. */
function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    SWRConfig,
    {
      value: {
        provider: () => new Map(),
        dedupingInterval: 0,
        shouldRetryOnError: false,
      },
    },
    children,
  )
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockProject: Project = {
  id: "proj-1",
  name: "DevTrack",
  slug: "devtrack",
  domain: "engineering",
  workflow: "sdlc",
  tags: ["typescript"],
  repoUrl: "https://github.com/org/devtrack",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-03-01T00:00:00Z"),
}

const mockPR: PullRequest = {
  id: "pr-1",
  projectId: "proj-1",
  number: 42,
  title: "feat: add SWR hooks",
  status: "open",
  url: "https://github.com/org/devtrack/pull/42",
  author: "octocat",
  openedAt: new Date("2026-03-10T00:00:00Z"),
  createdAt: new Date("2026-03-10T00:00:00Z"),
  updatedAt: new Date("2026-03-10T00:00:00Z"),
}

const mockEvent: Event = {
  id: "evt-1",
  projectId: "proj-1",
  type: "pr_opened",
  title: "PR #42 opened",
  metadata: { pr_number: 42 },
  occurredAt: new Date("2026-03-10T00:00:00Z"),
  createdAt: new Date("2026-03-10T00:00:00Z"),
  updatedAt: new Date("2026-03-10T00:00:00Z"),
}

const _mockStatus: ProjectStatus = {
  project_id: "proj-1",
  active_prd_count: 2,
  total_prd_count: 5,
  open_pr_count: 3,
  last_activity_at: new Date("2026-03-15T12:00:00Z"),
  health: "active",
}

// ---------------------------------------------------------------------------
// Lazy import helper so we can set env vars before the module loads
// ---------------------------------------------------------------------------

async function importHooks() {
  return import("@/lib/hooks")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("API key fetcher (createApiFetcher)", () => {
  beforeEach(() => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("includes X-Api-Key header on every request", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope({ hello: "world" }),
    })

    const { createApiFetcher } = await importHooks()
    const apiFetcher = createApiFetcher()
    await apiFetcher("/api/v1/projects")

    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/projects",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Api-Key": API_KEY }),
      }),
    )
  })

  it("unwraps ApiEnvelope and returns the data field", async () => {
    const envelope = makeEnvelope({ id: "p1", name: "Foo" })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => envelope,
    })

    const { createApiFetcher } = await importHooks()
    const apiFetcher = createApiFetcher()
    const result = await apiFetcher("/api/v1/projects")

    expect(result).toEqual(envelope.data)
  })

  it("throws when the HTTP response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    })

    const { createApiFetcher } = await importHooks()
    const apiFetcher = createApiFetcher()

    await expect(apiFetcher("/api/v1/projects")).rejects.toThrow()
  })

  it("attaches status to thrown errors", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
    })

    const { createApiFetcher } = await importHooks()
    const apiFetcher = createApiFetcher()

    try {
      await apiFetcher("/api/v1/projects")
      expect.fail("Should have thrown")
    } catch (err) {
      expect((err as Error & { status?: number }).status).toBe(403)
    }
  })

  it("works when DEVTRACK_API_KEY is not set (no header crash)", async () => {
    vi.unstubAllEnvs()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope([]),
    })

    const { createApiFetcher } = await importHooks()
    const apiFetcher = createApiFetcher()
    // Should not throw even with no key — just won't have the header
    await expect(apiFetcher("/api/v1/projects")).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// SWR global config
// ---------------------------------------------------------------------------

describe("SWR global config (getSWRConfig)", () => {
  afterEach(() => {
    vi.resetModules()
  })

  it("exports a config object with 30s refreshInterval", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getSWRConfig } = await importHooks()
    const config = getSWRConfig()

    expect(config.refreshInterval).toBe(30_000)
  })

  it("exports a config with revalidateOnFocus set", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getSWRConfig } = await importHooks()
    const config = getSWRConfig()

    // Acceptance criteria: revalidateOnFocus must be explicitly configured
    expect(config).toHaveProperty("revalidateOnFocus")
  })

  it("exports a config with error retry configured", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getSWRConfig } = await importHooks()
    const config = getSWRConfig()

    // onErrorRetry or shouldRetryOnError must be present
    const hasRetryConfig = "onErrorRetry" in config || "shouldRetryOnError" in config
    expect(hasRetryConfig).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Cache key convention
// ---------------------------------------------------------------------------

describe("Cache key conventions", () => {
  afterEach(() => {
    vi.resetModules()
  })

  it("useProjects cache key is /api/v1/projects", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getProjectsKey } = await importHooks()
    expect(getProjectsKey()).toBe("/api/v1/projects")
  })

  it("useProjects cache key includes pagination params in query string", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getProjectsKey } = await importHooks()
    const key = getProjectsKey({ page: 2, limit: 10 })
    expect(key).toContain("/api/v1/projects")
    expect(key).toContain("page=2")
    expect(key).toContain("limit=10")
  })

  it("useProject cache key is /api/v1/projects/[slug]", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getProjectKey } = await importHooks()
    expect(getProjectKey("devtrack")).toBe("/api/v1/projects/devtrack")
  })

  it("getProjectKey returns null when slug is empty", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getProjectKey } = await importHooks()
    expect(getProjectKey("")).toBeNull()
    expect(getProjectKey(null)).toBeNull()
    expect(getProjectKey(undefined)).toBeNull()
  })

  it("usePRs cache key is /api/v1/prs", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getPRsKey } = await importHooks()
    expect(getPRsKey()).toBe("/api/v1/prs")
  })

  it("usePRs cache key includes projectId filter when provided", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getPRsKey } = await importHooks()
    const key = getPRsKey({ projectId: "proj-1" })
    expect(key).toContain("project_id=proj-1")
  })

  it("useTimeline cache key is /api/v1/events for global timeline", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getTimelineKey } = await importHooks()
    expect(getTimelineKey()).toBe("/api/v1/events")
  })

  it("useTimeline cache key scopes to project when projectId provided", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getTimelineKey } = await importHooks()
    const key = getTimelineKey({ projectId: "proj-1" })
    expect(key).toContain("proj-1")
  })

  it("useActivity cache key is /api/v1/events/summary", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getActivityKey } = await importHooks()
    expect(getActivityKey()).toBe("/api/v1/events/summary")
  })
})

// ---------------------------------------------------------------------------
// useProjects
// ---------------------------------------------------------------------------

describe("useProjects", () => {
  beforeEach(() => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("returns typed project list data on success", async () => {
    const envelope = makePaginatedEnvelope([mockProject])
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => envelope,
    })

    const { useProjects } = await importHooks()
    const { result } = renderHook(() => useProjects(), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual([mockProject])
    expect(result.current.error).toBeUndefined()
  })

  it("surfaces error state when fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    const { useProjects } = await importHooks()
    const { result } = renderHook(() => useProjects(), { wrapper })

    await waitFor(() => expect(result.current.error).toBeDefined())
    expect(result.current.data).toBeUndefined()
  })

  it("passes page and limit as query string params", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([mockProject]),
    })

    const { useProjects } = await importHooks()
    renderHook(() => useProjects({ page: 3, limit: 5 }), { wrapper })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain("page=3")
    expect(calledUrl).toContain("limit=5")
  })

  it("sends X-Api-Key header on every request", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([mockProject]),
    })

    const { useProjects } = await importHooks()
    renderHook(() => useProjects(), { wrapper })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calledOptions = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(calledOptions?.headers?.["X-Api-Key"]).toBe(API_KEY)
  })

  it("exposes pagination meta alongside data", async () => {
    const meta: PaginationMeta = { total: 50, page: 2, per_page: 10 }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([mockProject], 50, 2, 10),
    })

    const { useProjects } = await importHooks()
    const { result } = renderHook(() => useProjects({ page: 2, limit: 10 }), {
      wrapper,
    })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.meta).toEqual(meta)
  })

  it("accepts custom SWR options (composable)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([]),
    })

    const onSuccess = vi.fn()
    const { useProjects } = await importHooks()
    renderHook(() => useProjects({}, { onSuccess }), { wrapper })

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })
})

// ---------------------------------------------------------------------------
// useProject
// ---------------------------------------------------------------------------

describe("useProject", () => {
  beforeEach(() => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("returns a single typed project on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope(mockProject),
    })

    const { useProject } = await importHooks()
    const { result } = renderHook(() => useProject("devtrack"), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual(mockProject)
    expect(result.current.error).toBeUndefined()
  })

  it("fetches from /api/v1/projects/[slug]", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope(mockProject),
    })

    const { useProject } = await importHooks()
    renderHook(() => useProject("devtrack"), { wrapper })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toBe("/api/v1/projects/devtrack")
  })

  it("is disabled when slug is null (returns no data, no fetch)", async () => {
    global.fetch = vi.fn()

    const { useProject } = await importHooks()
    const { result } = renderHook(() => useProject(null), { wrapper })

    // Give SWR a tick to potentially fire
    await new Promise((r) => setTimeout(r, 50))
    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })

  it("is disabled when slug is undefined", async () => {
    global.fetch = vi.fn()

    const { useProject } = await importHooks()
    const { result } = renderHook(() => useProject(undefined), { wrapper })

    await new Promise((r) => setTimeout(r, 50))
    expect(fetch).not.toHaveBeenCalled()
    expect(result.current.data).toBeUndefined()
  })

  it("surfaces 404 errors in error state", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })

    const { useProject } = await importHooks()
    const { result } = renderHook(() => useProject("nonexistent"), { wrapper })

    await waitFor(() => expect(result.current.error).toBeDefined())
    expect((result.current.error as Error & { status?: number }).status).toBe(404)
  })

  it("sends X-Api-Key header", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope(mockProject),
    })

    const { useProject } = await importHooks()
    renderHook(() => useProject("devtrack"), { wrapper })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calledOptions = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(calledOptions?.headers?.["X-Api-Key"]).toBe(API_KEY)
  })

  it("accepts custom SWR options (composable)", async () => {
    const onSuccess = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope(mockProject),
    })

    const { useProject } = await importHooks()
    renderHook(() => useProject("devtrack", { onSuccess }), { wrapper })

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })
})

// ---------------------------------------------------------------------------
// usePRs
// ---------------------------------------------------------------------------

describe("usePRs", () => {
  beforeEach(() => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("returns typed pull request list on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([mockPR]),
    })

    const { usePRs } = await importHooks()
    const { result } = renderHook(() => usePRs(), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual([mockPR])
    expect(result.current.error).toBeUndefined()
  })

  it("passes projectId as query param", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([mockPR]),
    })

    const { usePRs } = await importHooks()
    renderHook(() => usePRs({ projectId: "proj-1" }), { wrapper })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain("project_id=proj-1")
  })

  it("passes pagination params as query string", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([]),
    })

    const { usePRs } = await importHooks()
    renderHook(() => usePRs({ page: 2, limit: 25 }), { wrapper })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain("page=2")
    expect(calledUrl).toContain("limit=25")
  })

  it("exposes pagination meta", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([mockPR], 100, 1, 20),
    })

    const { usePRs } = await importHooks()
    const { result } = renderHook(() => usePRs(), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.meta?.total).toBe(100)
  })

  it("surfaces error state when fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    const { usePRs } = await importHooks()
    const { result } = renderHook(() => usePRs(), { wrapper })

    await waitFor(() => expect(result.current.error).toBeDefined())
  })

  it("sends X-Api-Key header", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([mockPR]),
    })

    const { usePRs } = await importHooks()
    renderHook(() => usePRs(), { wrapper })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calledOptions = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(calledOptions?.headers?.["X-Api-Key"]).toBe(API_KEY)
  })

  it("accepts custom SWR options (composable)", async () => {
    const onSuccess = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([]),
    })

    const { usePRs } = await importHooks()
    renderHook(() => usePRs({}, { onSuccess }), { wrapper })

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it("uses /api/v1/prs as base cache key", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([]),
    })

    const { usePRs } = await importHooks()
    renderHook(() => usePRs(), { wrapper })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toMatch(/^\/api\/v1\/prs/)
  })
})

// ---------------------------------------------------------------------------
// useTimeline
// ---------------------------------------------------------------------------

describe("useTimeline", () => {
  beforeEach(() => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("returns typed event list on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([mockEvent]),
    })

    const { useTimeline } = await importHooks()
    const { result } = renderHook(() => useTimeline(), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual([mockEvent])
    expect(result.current.error).toBeUndefined()
  })

  it("passes projectId as query param when provided", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([mockEvent]),
    })

    const { useTimeline } = await importHooks()
    renderHook(() => useTimeline({ projectId: "proj-1" }), { wrapper })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain("project_id=proj-1")
  })

  it("passes pagination params", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([]),
    })

    const { useTimeline } = await importHooks()
    renderHook(() => useTimeline({ page: 2, limit: 50 }), { wrapper })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain("page=2")
    expect(calledUrl).toContain("limit=50")
  })

  it("exposes pagination meta", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([mockEvent], 200, 1, 20),
    })

    const { useTimeline } = await importHooks()
    const { result } = renderHook(() => useTimeline(), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.meta?.total).toBe(200)
  })

  it("surfaces error state when fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })

    const { useTimeline } = await importHooks()
    const { result } = renderHook(() => useTimeline(), { wrapper })

    await waitFor(() => expect(result.current.error).toBeDefined())
  })

  it("sends X-Api-Key header", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([mockEvent]),
    })

    const { useTimeline } = await importHooks()
    renderHook(() => useTimeline(), { wrapper })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calledOptions = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(calledOptions?.headers?.["X-Api-Key"]).toBe(API_KEY)
  })

  it("accepts custom SWR options (composable)", async () => {
    const onSuccess = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([]),
    })

    const { useTimeline } = await importHooks()
    renderHook(() => useTimeline({}, { onSuccess }), { wrapper })

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it("uses /api/v1/events as base cache key", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makePaginatedEnvelope([]),
    })

    const { useTimeline } = await importHooks()
    renderHook(() => useTimeline(), { wrapper })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toMatch(/^\/api\/v1\/events/)
  })
})

// ---------------------------------------------------------------------------
// useActivity
// ---------------------------------------------------------------------------

describe("useActivity", () => {
  beforeEach(() => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("returns activity summary data on success", async () => {
    const summary = { recent_events: 12, active_projects: 3 }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope(summary),
    })

    const { useActivity } = await importHooks()
    const { result } = renderHook(() => useActivity(), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data).toEqual(summary)
    expect(result.current.error).toBeUndefined()
  })

  it("fetches from /api/v1/events/summary", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope({}),
    })

    const { useActivity } = await importHooks()
    renderHook(() => useActivity(), { wrapper })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toBe("/api/v1/events/summary")
  })

  it("surfaces error state when fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 })

    const { useActivity } = await importHooks()
    const { result } = renderHook(() => useActivity(), { wrapper })

    await waitFor(() => expect(result.current.error).toBeDefined())
  })

  it("sends X-Api-Key header", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope({}),
    })

    const { useActivity } = await importHooks()
    renderHook(() => useActivity(), { wrapper })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calledOptions = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(calledOptions?.headers?.["X-Api-Key"]).toBe(API_KEY)
  })

  it("accepts custom SWR options (composable)", async () => {
    const onSuccess = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope({}),
    })

    const { useActivity } = await importHooks()
    renderHook(() => useActivity({ onSuccess }), { wrapper })

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it("passes projectId filter when provided", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeEnvelope({}),
    })

    const { useActivity } = await importHooks()
    renderHook(() => useActivity({ projectId: "proj-1" }), { wrapper })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain("project_id=proj-1")
  })
})

// ---------------------------------------------------------------------------
// reactiveSWR cache key contract
// ---------------------------------------------------------------------------

describe("reactiveSWR cache key contract", () => {
  /**
   * reactiveSWR performs direct cache writes using the SWR cache key as the
   * address. These tests verify that every hook's cache key is deterministic
   * and predictable so that SSE push events can target the correct cache entry
   * without triggering a re-fetch.
   */

  afterEach(() => {
    vi.resetModules()
  })

  it("getProjectsKey() with no args returns the canonical projects list key", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getProjectsKey } = await importHooks()
    expect(getProjectsKey()).toBe("/api/v1/projects")
  })

  it("getProjectKey(slug) encodes the slug in the path (not query string)", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getProjectKey } = await importHooks()
    const key = getProjectKey("my-project")
    // Key must be path-based so reactiveSWR can match /api/v1/projects/my-project
    expect(key).toMatch(/\/api\/v1\/projects\/my-project/)
    expect(key).not.toContain("?slug=")
  })

  it("getPRsKey() with no args returns the canonical PRs list key", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getPRsKey } = await importHooks()
    expect(getPRsKey()).toBe("/api/v1/prs")
  })

  it("getTimelineKey() with no args returns the canonical events key", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getTimelineKey } = await importHooks()
    expect(getTimelineKey()).toBe("/api/v1/events")
  })

  it("getActivityKey() returns a stable key", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getActivityKey } = await importHooks()
    // Calling twice with same args must produce the exact same string
    expect(getActivityKey()).toBe(getActivityKey())
    expect(typeof getActivityKey()).toBe("string")
  })

  it("pagination params produce the same key order each call (deterministic)", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getProjectsKey } = await importHooks()
    const keyA = getProjectsKey({ page: 1, limit: 20 })
    const keyB = getProjectsKey({ page: 1, limit: 20 })
    expect(keyA).toBe(keyB)
  })
})

// ---------------------------------------------------------------------------
// Edge cases: API key security and fetcher stability
// ---------------------------------------------------------------------------

describe("API key security and fetcher stability", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("createApiFetcher does not send X-Api-Key when env var is undefined", async () => {
    vi.unstubAllEnvs()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })

    const { createApiFetcher } = await importHooks()
    const apiFetcher = createApiFetcher()
    await apiFetcher("/api/v1/projects")

    const calledOptions = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]
    // When no API key is set, no X-Api-Key header should be present
    expect(calledOptions?.headers?.["X-Api-Key"]).toBeUndefined()
  })

  it("createApiFetcher handles network failure (fetch rejects)", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    global.fetch = vi.fn().mockRejectedValue(new Error("Network failure"))

    const { createApiFetcher } = await importHooks()
    const apiFetcher = createApiFetcher()
    await expect(apiFetcher("/api/v1/projects")).rejects.toThrow("Network failure")
  })

  it("createApiFetcher handles malformed JSON response", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token")
      },
    })

    const { createApiFetcher } = await importHooks()
    const apiFetcher = createApiFetcher()
    await expect(apiFetcher("/api/v1/projects")).rejects.toThrow()
  })

  it("useActivity strips SWR-specific keys before passing to swrOpts", async () => {
    // useActivity merges projectId + SWR opts; verify it doesn't pass projectId into SWR
    const onSuccess = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { count: 5 } }),
    })

    const { useActivity } = await importHooks()
    const { result } = renderHook(() => useActivity({ projectId: "proj-1", onSuccess }), {
      wrapper,
    })

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(result.current.data).toBeDefined()
    // projectId filtered to query param — fetch URL should include it
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain("project_id=proj-1")
  })

  it("getProjectKey with empty string returns null (not a falsy URL)", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getProjectKey } = await importHooks()
    // Empty string is falsy — should return null to prevent SWR fetching
    expect(getProjectKey("")).toBeNull()
  })

  it("buildQueryString encodes special characters in values", async () => {
    vi.stubEnv("DEVTRACK_API_KEY", API_KEY)
    const { getPRsKey } = await importHooks()
    // If a projectId contained special chars, they should be percent-encoded
    const key = getPRsKey({ projectId: "org/repo" })
    expect(key).toContain("org%2Frepo")
  })
})
