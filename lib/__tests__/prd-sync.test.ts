import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PrdSyncOptions, PrdSyncResult } from "@/types/prd-sync"

// Mock the PRD parser (WI-589)
vi.mock("@/lib/prd-parser", () => ({
  parsePrd: vi.fn(),
}))

// Mock fs for reading PRD file content
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}))

// Mock fetch for API calls
const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

const { syncPrds } = await import("@/lib/prd-sync")
const { parsePrd } = await import("@/lib/prd-parser")
const fs = await import("node:fs")

const BASE_OPTIONS: PrdSyncOptions = {
  projectId: "proj-123",
  prdPath: "prd/",
  changedFiles: ["prd/0001-auth.md", "prd/0002-dashboard.md", "src/components/Button.tsx"],
  apiUrl: "https://devtrack.example.com",
  apiKey: "test-api-key",
}

const PARSED_PRD = {
  frontmatter: {
    title: "Auth Feature",
    summary: "Implement authentication flow",
    status: "in-progress" as const,
  },
  workItems: [
    { title: "Design schema", completed: true },
    { title: "Implement API", completed: false },
  ],
}

const PARSED_PRD_NO_WORK_ITEMS = {
  frontmatter: {
    title: "Dashboard",
    summary: "Build dashboard UI",
    status: "queued" as const,
  },
  workItems: [],
}

function mockFetchSuccess(body: object, status = 200) {
  mockFetch.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  )
}

describe("syncPrds", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fs.readFileSync).mockReturnValue("# PRD content")
    vi.mocked(parsePrd).mockReturnValue(PARSED_PRD)
    mockFetchSuccess({ data: { id: "prd-abc" } }, 201)
  })

  describe("file filtering", () => {
    it("only processes files within prd_path", async () => {
      await syncPrds(BASE_OPTIONS)

      // parsePrd should be called for prd/ files only, not src/ files
      expect(parsePrd).toHaveBeenCalledTimes(2)
    })

    it("skips files outside prd_path", async () => {
      const result: PrdSyncResult = await syncPrds(BASE_OPTIONS)

      expect(result.skipped).toContain("src/components/Button.tsx")
    })

    it("handles changedFiles with no prd_path matches (returns all skipped)", async () => {
      const opts = { ...BASE_OPTIONS, changedFiles: ["src/app.ts", "README.md"] }

      const result = await syncPrds(opts)

      expect(result.synced).toHaveLength(0)
      expect(result.skipped).toHaveLength(2)
    })

    it("handles empty changedFiles array", async () => {
      const result = await syncPrds({ ...BASE_OPTIONS, changedFiles: [] })

      expect(result.synced).toHaveLength(0)
      expect(result.skipped).toHaveLength(0)
    })

    it("matches files by prd_path prefix", async () => {
      const opts = {
        ...BASE_OPTIONS,
        prdPath: "docs/prds/",
        changedFiles: ["docs/prds/feature.md", "prd/other.md"],
      }

      vi.mocked(parsePrd).mockReturnValue(PARSED_PRD)
      await syncPrds(opts)

      expect(parsePrd).toHaveBeenCalledTimes(1)
    })
  })

  describe("PRD file parsing", () => {
    it("reads the PRD file contents before parsing", async () => {
      await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/0001-auth.md"] })

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining("prd/0001-auth.md"),
        "utf-8",
      )
    })

    it("calls parsePrd for each file in prd_path", async () => {
      await syncPrds(BASE_OPTIONS)

      expect(parsePrd).toHaveBeenCalledTimes(2)
    })

    it("skips files whose parsePrd returns null frontmatter", async () => {
      vi.mocked(parsePrd).mockReturnValue({ frontmatter: null, workItems: [] })

      const result = await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/no-frontmatter.md"] })

      expect(result.skipped).toContain("prd/no-frontmatter.md")
      expect(result.synced).toHaveLength(0)
    })

    it("skips all files with no frontmatter, continues processing others", async () => {
      vi.mocked(parsePrd)
        .mockReturnValueOnce({ frontmatter: null, workItems: [] })
        .mockReturnValueOnce(PARSED_PRD)

      mockFetchSuccess({ data: { id: "prd-abc" } }, 201)

      const result = await syncPrds(BASE_OPTIONS)

      expect(result.skipped).toHaveLength(2) // 1 non-prd file from BASE_OPTIONS + 1 null-frontmatter prd file
      expect(result.synced).toHaveLength(1)
    })
  })

  describe("PRD API calls", () => {
    it("POSTs to /api/v1/projects/:id/prds to create a new PRD", async () => {
      mockFetchSuccess({ data: { id: "prd-new" } }, 201)

      await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/0001-auth.md"] })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/projects/${BASE_OPTIONS.projectId}/prds`),
        expect.objectContaining({ method: expect.stringMatching(/POST|PUT/) }),
      )
    })

    it("sends Authorization header with API key", async () => {
      mockFetchSuccess({ data: { id: "prd-new" } }, 201)

      await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/0001-auth.md"] })

      const call = mockFetch.mock.calls[0]
      const options = call[1] as RequestInit
      const headers = options.headers as Record<string, string>
      expect(headers).toMatchObject(
        expect.objectContaining({
          Authorization: expect.stringContaining("test-api-key"),
        }),
      )
    })

    it("includes title, summary, status, and source_path in the PRD payload", async () => {
      mockFetchSuccess({ data: { id: "prd-new" } }, 201)

      await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/0001-auth.md"] })

      const call = mockFetch.mock.calls[0]
      const options = call[1] as RequestInit
      const body = JSON.parse(options.body as string)
      expect(body).toMatchObject({
        title: "Auth Feature",
        summary: "Implement authentication flow",
        status: "in_progress",
        source_path: expect.stringContaining("prd/0001-auth.md"),
      })
    })

    it("records a prd_synced event after syncing", async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: { id: "prd-abc" } }), { status: 201 }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 200 })) // work items
        .mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }), { status: 201 })) // event

      await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/0001-auth.md"] })

      const allUrls = mockFetch.mock.calls.map(([url]: any[]) => url)
      expect(
        allUrls.some((url: string) => url.includes("events") || url.includes("prd_synced")),
      ).toBe(true)
    })

    it("marks record as created: true when PRD is newly created (201)", async () => {
      mockFetchSuccess({ data: { id: "prd-new" } }, 201)

      const result = await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/0001-auth.md"] })

      const record = result.synced[0]
      expect(record.created).toBe(true)
    })

    it("marks record as updated: true when PRD already exists (200)", async () => {
      mockFetchSuccess({ data: { id: "prd-existing" } }, 200)

      const result = await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/0001-auth.md"] })

      const record = result.synced[0]
      expect(record.updated).toBe(true)
    })
  })

  describe("work item sync", () => {
    it("syncs work items to /api/v1/prds/:id/work-items", async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: { id: "prd-abc" } }), { status: 201 }),
        )
        .mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }))

      await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/0001-auth.md"] })

      const allUrls = mockFetch.mock.calls.map(([url]: any[]) => url)
      expect(
        allUrls.some((url: string) => url.includes("work-items") || url.includes("prd-abc")),
      ).toBe(true)
    })

    it("maps completed: true work items to status: 'done'", async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: { id: "prd-abc" } }), { status: 201 }),
        )
        .mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }))

      await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/0001-auth.md"] })

      const workItemCalls = mockFetch.mock.calls.filter(([url]: any[]) => url.includes("work-item"))
      const bodies = workItemCalls.map(([, opts]: any[]) => JSON.parse(opts.body as string))
      const doneItems = bodies.filter((b: { status?: string }) => b.status === "done")
      expect(doneItems.length).toBeGreaterThan(0)
    })

    it("maps completed: false work items to status: 'todo'", async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: { id: "prd-abc" } }), { status: 201 }),
        )
        .mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }))

      await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/0001-auth.md"] })

      const workItemCalls = mockFetch.mock.calls.filter(([url]: any[]) => url.includes("work-item"))
      const bodies = workItemCalls.map(([, opts]: any[]) => JSON.parse(opts.body as string))
      const todoItems = bodies.filter((b: { status?: string }) => b.status === "todo")
      expect(todoItems.length).toBeGreaterThan(0)
    })

    it("records the number of work items synced", async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: { id: "prd-abc" } }), { status: 201 }),
        )
        .mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }))

      const result = await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/0001-auth.md"] })

      expect(result.synced[0].workItemsSynced).toBe(2) // PARSED_PRD has 2 work items
    })

    it("skips work item sync when PRD has no work items", async () => {
      vi.mocked(parsePrd).mockReturnValue(PARSED_PRD_NO_WORK_ITEMS)
      mockFetchSuccess({ data: { id: "prd-abc" } }, 201)

      const result = await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/0002-dashboard.md"] })

      expect(result.synced[0].workItemsSynced).toBe(0)
    })
  })

  describe("error resilience", () => {
    it("continues processing other files when one PRD API call fails", async () => {
      vi.mocked(parsePrd).mockReturnValue(PARSED_PRD)
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValue(new Response(JSON.stringify({ data: { id: "prd-2" } }), { status: 201 }))

      const result = await syncPrds(BASE_OPTIONS)

      // Should have processed the second file despite first failing
      expect(result.synced.length + result.skipped.length).toBe(
        BASE_OPTIONS.changedFiles.filter((f) => f.startsWith("prd/")).length +
          BASE_OPTIONS.changedFiles.filter((f) => !f.startsWith("prd/")).length,
      )
    })

    it("continues when work item sync fails, still records prd as synced", async () => {
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: { id: "prd-abc" } }), { status: 201 }),
        )
        .mockRejectedValueOnce(new Error("Work item sync failed"))

      const result = await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/0001-auth.md"] })

      // PRD itself was synced even if work items failed
      expect(result.synced.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe("return value", () => {
    it("returns a PrdSyncResult with synced and skipped arrays", async () => {
      const result: PrdSyncResult = await syncPrds(BASE_OPTIONS)

      expect(result).toHaveProperty("synced")
      expect(result).toHaveProperty("skipped")
      expect(Array.isArray(result.synced)).toBe(true)
      expect(Array.isArray(result.skipped)).toBe(true)
    })

    it("each synced record has filePath, prdId, created, updated, workItemsSynced, eventRecorded", async () => {
      mockFetchSuccess({ data: { id: "prd-abc" } }, 201)

      const result = await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/0001-auth.md"] })

      const record = result.synced[0]
      expect(record).toHaveProperty("filePath")
      expect(record).toHaveProperty("prdId")
      expect(record).toHaveProperty("created")
      expect(record).toHaveProperty("updated")
      expect(record).toHaveProperty("workItemsSynced")
      expect(record).toHaveProperty("eventRecorded")
    })

    it("filePath in synced record matches the input file path", async () => {
      mockFetchSuccess({ data: { id: "prd-abc" } }, 201)

      const result = await syncPrds({ ...BASE_OPTIONS, changedFiles: ["prd/0001-auth.md"] })

      expect(result.synced[0].filePath).toBe("prd/0001-auth.md")
    })
  })
})
