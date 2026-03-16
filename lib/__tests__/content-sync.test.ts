import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ContentSyncOptions, ContentSyncResult } from "@/types/content-sync"

vi.mock("@/lib/content-parser", () => ({
  parseContentFile: vi.fn(),
}))

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}))

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

const { syncContent } = await import("@/lib/content-sync")
const { parseContentFile } = await import("@/lib/content-parser")
const fs = await import("node:fs")

const BASE_OPTIONS: ContentSyncOptions = {
  projectId: "proj-123",
  contentPath: "content/",
  draftPath: "drafts/",
  changedFiles: [
    "content/my-article.md",
    "drafts/wip-post.md",
    "src/components/Layout.tsx",
  ],
  apiUrl: "https://devtrack.example.com",
  apiKey: "test-api-key",
}

const PARSED_PUBLISHED = {
  frontmatter: {
    title: "My Article",
    summary: "A great article",
    status: "published" as const,
    tags: ["typescript", "devops"],
  },
  sourcePath: "content/my-article.md",
  isDraft: false,
}

const PARSED_DRAFT = {
  frontmatter: {
    title: "WIP Post",
    summary: "Work in progress",
    status: "draft" as const,
    tags: ["wip"],
  },
  sourcePath: "drafts/wip-post.md",
  isDraft: true,
}

const PARSED_DRAFT_NO_OPTIONAL = {
  frontmatter: {
    title: "Minimal Draft",
    status: "draft" as const,
  },
  sourcePath: "drafts/minimal.md",
  isDraft: true,
}

function makeFetchResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("syncContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fs.readFileSync).mockReturnValue("# content")
    vi.mocked(parseContentFile).mockImplementation((_content, filePath) =>
      filePath.startsWith("content/") ? PARSED_PUBLISHED : PARSED_DRAFT,
    )
    mockFetch.mockResolvedValue(makeFetchResponse({ data: { id: "ci-abc" } }, 201))
  })

  describe("file filtering", () => {
    it("processes files in content_path", async () => {
      await syncContent(BASE_OPTIONS)

      expect(parseContentFile).toHaveBeenCalledWith(
        expect.any(String),
        "content/my-article.md",
        expect.objectContaining({ contentPath: "content/", draftPath: "drafts/" }),
      )
    })

    it("processes files in draft_path", async () => {
      await syncContent(BASE_OPTIONS)

      expect(parseContentFile).toHaveBeenCalledWith(
        expect.any(String),
        "drafts/wip-post.md",
        expect.objectContaining({ contentPath: "content/", draftPath: "drafts/" }),
      )
    })

    it("skips files outside both content_path and draft_path", async () => {
      const result: ContentSyncResult = await syncContent(BASE_OPTIONS)

      expect(result.skipped).toContain("src/components/Layout.tsx")
    })

    it("only calls parseContentFile for content/draft files, not others", async () => {
      await syncContent(BASE_OPTIONS)

      expect(parseContentFile).toHaveBeenCalledTimes(2)
    })

    it("returns all files skipped when none match content or draft path", async () => {
      const opts = { ...BASE_OPTIONS, changedFiles: ["README.md", "package.json"] }

      const result = await syncContent(opts)

      expect(result.synced).toHaveLength(0)
      expect(result.skipped).toHaveLength(2)
    })

    it("handles empty changedFiles array", async () => {
      const result = await syncContent({ ...BASE_OPTIONS, changedFiles: [] })

      expect(result.synced).toHaveLength(0)
      expect(result.skipped).toHaveLength(0)
    })

    it("processes only content_path files when draftPath is empty string", async () => {
      const opts = {
        ...BASE_OPTIONS,
        draftPath: "",
        changedFiles: ["content/article.md", "drafts/wip.md"],
      }
      vi.mocked(parseContentFile).mockReturnValue(PARSED_PUBLISHED)

      await syncContent(opts)

      expect(parseContentFile).toHaveBeenCalledTimes(1)
    })
  })

  describe("frontmatter parsing", () => {
    it("reads file content before parsing", async () => {
      await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining("content/my-article.md"),
        "utf-8",
      )
    })

    it("passes contentPath and draftPath to parseContentFile", async () => {
      await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      expect(parseContentFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { contentPath: "content/", draftPath: "drafts/" },
      )
    })

    it("skips files where parseContentFile returns null frontmatter", async () => {
      vi.mocked(parseContentFile).mockReturnValue({
        frontmatter: null,
        sourcePath: "content/no-fm.md",
        isDraft: false,
      })

      const result = await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/no-fm.md"] })

      expect(result.skipped).toContain("content/no-fm.md")
      expect(result.synced).toHaveLength(0)
    })

    it("continues processing other files when one has null frontmatter", async () => {
      vi.mocked(parseContentFile)
        .mockReturnValueOnce({ frontmatter: null, sourcePath: "content/no-fm.md", isDraft: false })
        .mockReturnValueOnce(PARSED_DRAFT)

      const result = await syncContent(BASE_OPTIONS)

      expect(result.skipped.length).toBeGreaterThanOrEqual(1)
      expect(result.synced.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("ContentItem API calls", () => {
    it("POSTs to /api/v1/projects/:id/content to create a ContentItem", async () => {
      await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/projects/${BASE_OPTIONS.projectId}/content`),
        expect.objectContaining({ method: expect.stringMatching(/POST|PUT/) }),
      )
    })

    it("sends Authorization header with API key", async () => {
      await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      const headers = opts.headers as Record<string, string>
      expect(headers).toMatchObject({
        Authorization: expect.stringContaining("test-api-key"),
      })
    })

    it("includes title, status, and source_path in the ContentItem payload", async () => {
      await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(opts.body as string)
      expect(body).toMatchObject({
        title: "My Article",
        status: expect.stringMatching(/draft|published/),
        source_path: expect.stringContaining("content/my-article.md"),
      })
    })

    it("includes summary in payload when present", async () => {
      await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(opts.body as string)
      expect(body.summary).toBe("A great article")
    })

    it("includes tags in payload when present", async () => {
      await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(opts.body as string)
      expect(body.tags).toEqual(["typescript", "devops"])
    })

    it("omits summary from payload when not in frontmatter", async () => {
      vi.mocked(parseContentFile).mockReturnValue(PARSED_DRAFT_NO_OPTIONAL)
      mockFetch.mockResolvedValue(makeFetchResponse({ data: { id: "ci-abc" } }, 201))

      await syncContent({ ...BASE_OPTIONS, changedFiles: ["drafts/minimal.md"] })

      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(opts.body as string)
      expect(body.summary).toBeUndefined()
    })

    it("marks record as created: true on 201 response", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse({ data: { id: "ci-new" } }, 201))

      const result = await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      expect(result.synced[0].created).toBe(true)
      expect(result.synced[0].updated).toBe(false)
    })

    it("marks record as updated: true on 200 response", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse({ data: { id: "ci-existing" } }, 200))

      const result = await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      expect(result.synced[0].updated).toBe(true)
      expect(result.synced[0].created).toBe(false)
    })
  })

  describe("published status detection", () => {
    it("sets status 'published' when file is in content_path", async () => {
      vi.mocked(parseContentFile).mockReturnValue(PARSED_PUBLISHED)

      await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(opts.body as string)
      expect(body.status).toBe("published")
    })

    it("sets status 'published' when frontmatter status is 'published' (even in draft_path)", async () => {
      const draftPathPublished = {
        ...PARSED_PUBLISHED,
        sourcePath: "drafts/promoted.md",
        isDraft: false,
      }
      vi.mocked(parseContentFile).mockReturnValue(draftPathPublished)

      await syncContent({ ...BASE_OPTIONS, changedFiles: ["drafts/promoted.md"] })

      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(opts.body as string)
      expect(body.status).toBe("published")
    })

    it("sets status 'draft' when file is in draft_path and frontmatter status is 'draft'", async () => {
      vi.mocked(parseContentFile).mockReturnValue(PARSED_DRAFT)

      await syncContent({ ...BASE_OPTIONS, changedFiles: ["drafts/wip-post.md"] })

      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(opts.body as string)
      expect(body.status).toBe("draft")
    })

    it("marks record as published: true when content is published", async () => {
      vi.mocked(parseContentFile).mockReturnValue(PARSED_PUBLISHED)
      mockFetch.mockResolvedValue(makeFetchResponse({ data: { id: "ci-abc" } }, 201))

      const result = await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      expect(result.synced[0].published).toBe(true)
    })

    it("marks record as published: false for draft content", async () => {
      vi.mocked(parseContentFile).mockReturnValue(PARSED_DRAFT)
      mockFetch.mockResolvedValue(makeFetchResponse({ data: { id: "ci-abc" } }, 201))

      const result = await syncContent({ ...BASE_OPTIONS, changedFiles: ["drafts/wip-post.md"] })

      expect(result.synced[0].published).toBe(false)
    })
  })

  describe("event recording", () => {
    it("records a content_published event for published content", async () => {
      vi.mocked(parseContentFile).mockReturnValue(PARSED_PUBLISHED)
      mockFetch
        .mockResolvedValueOnce(makeFetchResponse({ data: { id: "ci-abc" } }, 201))
        .mockResolvedValue(makeFetchResponse({ data: {} }, 201)) // event

      const result = await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      expect(result.synced[0].eventType).toBe("content_published")
    })

    it("records a content_updated event for draft content", async () => {
      vi.mocked(parseContentFile).mockReturnValue(PARSED_DRAFT)
      mockFetch
        .mockResolvedValueOnce(makeFetchResponse({ data: { id: "ci-abc" } }, 201))
        .mockResolvedValue(makeFetchResponse({ data: {} }, 201)) // event

      const result = await syncContent({ ...BASE_OPTIONS, changedFiles: ["drafts/wip-post.md"] })

      expect(result.synced[0].eventType).toBe("content_updated")
    })

    it("calls the events API endpoint to record the event", async () => {
      vi.mocked(parseContentFile).mockReturnValue(PARSED_PUBLISHED)
      mockFetch
        .mockResolvedValueOnce(makeFetchResponse({ data: { id: "ci-abc" } }, 201))
        .mockResolvedValue(makeFetchResponse({ data: {} }, 201))

      await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      const allUrls = mockFetch.mock.calls.map(([url]: [string]) => url)
      expect(allUrls.some((url: string) => url.includes("event"))).toBe(true)
    })

    it("marks eventRecorded: true when event API call succeeds", async () => {
      vi.mocked(parseContentFile).mockReturnValue(PARSED_PUBLISHED)
      mockFetch
        .mockResolvedValueOnce(makeFetchResponse({ data: { id: "ci-abc" } }, 201))
        .mockResolvedValue(makeFetchResponse({ data: {} }, 201))

      const result = await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      expect(result.synced[0].eventRecorded).toBe(true)
    })
  })

  describe("error resilience", () => {
    it("continues processing other files when one ContentItem API call fails", async () => {
      vi.mocked(parseContentFile).mockReturnValue(PARSED_PUBLISHED)
      mockFetch
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValue(makeFetchResponse({ data: { id: "ci-2" } }, 201))

      const result = await syncContent(BASE_OPTIONS)

      const totalProcessed = result.synced.length + result.skipped.length
      expect(totalProcessed).toBe(BASE_OPTIONS.changedFiles.length)
    })

    it("continues when event recording fails after a successful content sync", async () => {
      vi.mocked(parseContentFile).mockReturnValue(PARSED_PUBLISHED)
      mockFetch
        .mockResolvedValueOnce(makeFetchResponse({ data: { id: "ci-abc" } }, 201))
        .mockRejectedValueOnce(new Error("Event API failed"))

      const result = await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      expect(result.synced.length + result.skipped.length).toBeGreaterThan(0)
    })
  })

  describe("return value", () => {
    it("returns a ContentSyncResult with synced and skipped arrays", async () => {
      const result: ContentSyncResult = await syncContent(BASE_OPTIONS)

      expect(result).toHaveProperty("synced")
      expect(result).toHaveProperty("skipped")
      expect(Array.isArray(result.synced)).toBe(true)
      expect(Array.isArray(result.skipped)).toBe(true)
    })

    it("each synced record has all required fields", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse({ data: { id: "ci-abc" } }, 201))

      const result = await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      const record = result.synced[0]
      expect(record).toHaveProperty("filePath")
      expect(record).toHaveProperty("contentItemId")
      expect(record).toHaveProperty("created")
      expect(record).toHaveProperty("updated")
      expect(record).toHaveProperty("published")
      expect(record).toHaveProperty("eventType")
      expect(record).toHaveProperty("eventRecorded")
    })

    it("filePath in synced record matches the input file path", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse({ data: { id: "ci-abc" } }, 201))

      const result = await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      expect(result.synced[0].filePath).toBe("content/my-article.md")
    })

    it("contentItemId is set from the API response", async () => {
      mockFetch.mockResolvedValue(makeFetchResponse({ data: { id: "ci-xyz" } }, 201))

      const result = await syncContent({ ...BASE_OPTIONS, changedFiles: ["content/my-article.md"] })

      expect(result.synced[0].contentItemId).toBe("ci-xyz")
    })
  })
})
