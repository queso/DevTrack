import { describe, expect, it } from "vitest"
import { mapPR, mapProject, mapTimelineEvent, mapWorkItem } from "@/lib/mappers"
import type { Event as ApiEvent } from "@/types/event"
import type { WorkItem as ApiWorkItem, Prd } from "@/types/prd"
import type { PullRequest as ApiPullRequest } from "@/types/pull-request"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function msAgo(ms: number): Date {
  return new Date(Date.now() - ms)
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

// Base Prisma-shaped API objects (snake_case / Date fields)
function makeApiProject(
  overrides: Partial<{
    id: string
    name: string
    workflow: "sdlc"
    domain: string | null
    tags: string[]
    repoUrl: string | null
    deployUrl: string | null
    lastActivityAt: Date | null
    prds: ApiPrdWithItems[]
    pullRequests: ApiPullRequest[]
    createdAt: Date
    updatedAt: Date
  }> = {},
) {
  return {
    id: "proj-1",
    name: "my-project",
    workflow: "sdlc" as const,
    domain: "arcanelayer",
    tags: ["web", "ts"],
    repoUrl: "https://github.com/org/my-project",
    deployUrl: null,
    lastActivityAt: msAgo(2 * HOUR),
    prds: [] as ApiPrdWithItems[],
    pullRequests: [] as ApiPullRequest[],
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  }
}

interface ApiPrdWithItems extends Prd {
  workItems: ApiWorkItem[]
}

function makePrd(overrides: Partial<ApiPrdWithItems> = {}): ApiPrdWithItems {
  return {
    id: "prd-1",
    project_id: "proj-1",
    title: "My PRD",
    summary: "A summary",
    status: "in_progress",
    source_path: null,
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-02"),
    workItems: [],
    ...overrides,
  }
}

function makeWorkItem(overrides: Partial<ApiWorkItem> = {}): ApiWorkItem {
  return {
    id: "wi-1",
    prd_id: "prd-1",
    title: "Do a thing",
    status: "todo",
    order: 0,
    created_at: new Date("2024-01-01"),
    updated_at: new Date("2024-01-01"),
    ...overrides,
  }
}

function makePR(overrides: Partial<ApiPullRequest> = {}): ApiPullRequest {
  return {
    id: "pr-1",
    projectId: "proj-1",
    branchId: "branch-1",
    prdId: null,
    githubId: 42,
    number: 42,
    title: "feat: cool change",
    status: "open",
    url: "https://github.com/org/repo/pull/42",
    author: "joshowens",
    checkStatus: "passing",
    openedAt: msAgo(6 * HOUR),
    mergedAt: null,
    createdAt: msAgo(6 * HOUR),
    updatedAt: msAgo(HOUR),
    ...overrides,
  }
}

function makeEvent(overrides: Partial<ApiEvent> = {}): ApiEvent {
  return {
    id: "ev-1",
    projectId: "proj-1",
    prdId: null,
    pullRequestId: null,
    type: "commit",
    title: "feat: add logging",
    metadata: {},
    occurredAt: msAgo(30 * 60 * 1000), // 30 minutes ago
    createdAt: msAgo(30 * 60 * 1000),
    updatedAt: msAgo(30 * 60 * 1000),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// mapWorkItem
// ---------------------------------------------------------------------------

describe("mapWorkItem", () => {
  it("maps status todo → todo", () => {
    const result = mapWorkItem(makeWorkItem({ status: "todo" }))
    expect(result.status).toBe("todo")
  })

  it("maps status in_progress → in-progress", () => {
    const result = mapWorkItem(makeWorkItem({ status: "in_progress" }))
    expect(result.status).toBe("in-progress")
  })

  it("maps status done → done", () => {
    const result = mapWorkItem(makeWorkItem({ status: "done" }))
    expect(result.status).toBe("done")
  })

  it("preserves id and title", () => {
    const item = makeWorkItem({ id: "wi-99", title: "Write docs" })
    const result = mapWorkItem(item)
    expect(result.id).toBe("wi-99")
    expect(result.title).toBe("Write docs")
  })

  it("output conforms to UI WorkItem shape (id, title, status)", () => {
    const result = mapWorkItem(makeWorkItem())
    expect(result).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      status: expect.stringMatching(/^(todo|in-progress|done)$/),
    })
  })
})

// ---------------------------------------------------------------------------
// mapPR
// ---------------------------------------------------------------------------

describe("mapPR", () => {
  it("maps open PR correctly", () => {
    const pr = makePR({ status: "open" })
    const result = mapPR(pr, "my-project")
    expect(result.status).toBe("open")
    expect(result.projectSlug).toBe("my-project")
    expect(result.number).toBe(42)
    expect(result.title).toBe("feat: cool change")
    expect(result.url).toBe("https://github.com/org/repo/pull/42")
    expect(result.author).toBe("joshowens")
  })

  it("maps draft status", () => {
    const result = mapPR(makePR({ status: "draft" }), "proj")
    expect(result.status).toBe("draft")
  })

  it("maps merged status", () => {
    const result = mapPR(makePR({ status: "merged" }), "proj")
    expect(result.status).toBe("merged")
  })

  it("maps review_requested → open (fallback)", () => {
    const result = mapPR(makePR({ status: "review_requested" }), "proj")
    // review_requested is a valid UI-adjacent status — mapper may normalize
    // Accept either "open" or "reviewed" as reasonable mappings
    expect(["open", "reviewed", "review_requested"]).toContain(result.status)
  })

  it("maps changes_requested → changes-requested", () => {
    const result = mapPR(makePR({ status: "changes_requested" }), "proj")
    expect(result.status).toBe("changes-requested")
  })

  it("maps approved status", () => {
    const result = mapPR(makePR({ status: "approved" }), "proj")
    expect(result.status).toBe("approved")
  })

  it("maps checkStatus: passing", () => {
    const result = mapPR(makePR({ checkStatus: "passing" }), "proj")
    expect(result.checkStatus).toBe("passing")
  })

  it("maps checkStatus: failing", () => {
    const result = mapPR(makePR({ checkStatus: "failing" }), "proj")
    expect(result.checkStatus).toBe("failing")
  })

  it("maps null checkStatus to pending", () => {
    const result = mapPR(makePR({ checkStatus: null }), "proj")
    expect(result.checkStatus).toBe("pending")
  })

  it("computes age label for PR opened less than 24h ago", () => {
    const pr = makePR({ openedAt: msAgo(3 * HOUR) })
    const result = mapPR(pr, "proj")
    // createdAt should be an ISO string
    expect(typeof result.createdAt).toBe("string")
    // The age label is derived from createdAt — verify it round-trips
    const diffHours = (Date.now() - new Date(result.createdAt).getTime()) / HOUR
    expect(diffHours).toBeGreaterThan(2)
    expect(diffHours).toBeLessThan(5)
  })

  it("sets unresolvedComments to 0 when not provided", () => {
    const result = mapPR(makePR(), "proj")
    expect(typeof result.unresolvedComments).toBe("number")
    expect(result.unresolvedComments).toBeGreaterThanOrEqual(0)
  })

  it("uses github PR number as numeric id source", () => {
    const pr = makePR({ number: 99 })
    const result = mapPR(pr, "proj")
    expect(result.number).toBe(99)
  })

  it("output has correct UI PullRequest shape", () => {
    const result = mapPR(makePR(), "proj")
    expect(result).toMatchObject({
      id: expect.any(String),
      projectSlug: expect.any(String),
      number: expect.any(Number),
      title: expect.any(String),
      branch: expect.any(String),
      status: expect.any(String),
      checkStatus: expect.any(String),
      createdAt: expect.any(String),
      url: expect.any(String),
      author: expect.any(String),
      unresolvedComments: expect.any(Number),
    })
  })
})

// ---------------------------------------------------------------------------
// mapTimelineEvent
// ---------------------------------------------------------------------------

describe("mapTimelineEvent", () => {
  it("maps commit event type", () => {
    const result = mapTimelineEvent(makeEvent({ type: "commit" }), "my-project")
    expect(result.type).toBe("commit")
  })

  it("maps pr_opened → pr-opened", () => {
    const result = mapTimelineEvent(makeEvent({ type: "pr_opened" }), "my-project")
    expect(result.type).toBe("pr-opened")
  })

  it("maps pr_merged → pr-merged", () => {
    const result = mapTimelineEvent(makeEvent({ type: "pr_merged" }), "my-project")
    expect(result.type).toBe("pr-merged")
  })

  it("maps pr_approved → pr-reviewed", () => {
    const result = mapTimelineEvent(makeEvent({ type: "pr_approved" }), "my-project")
    expect(result.type).toBe("pr-reviewed")
  })

  it("maps prd_updated → prd-update", () => {
    const result = mapTimelineEvent(makeEvent({ type: "prd_updated" }), "my-project")
    expect(result.type).toBe("prd-update")
  })

  it("preserves event id and maps projectSlug", () => {
    const result = mapTimelineEvent(makeEvent({ id: "ev-42" }), "blog-project")
    expect(result.id).toBe("ev-42")
    expect(result.projectSlug).toBe("blog-project")
  })

  it("uses event title as description", () => {
    const result = mapTimelineEvent(makeEvent({ title: "Merged PR #10" }), "proj")
    expect(result.description).toBe("Merged PR #10")
  })

  it("timestamp is an ISO string from occurredAt", () => {
    const occurred = new Date("2025-06-01T12:00:00Z")
    const result = mapTimelineEvent(makeEvent({ occurredAt: occurred }), "proj")
    expect(result.timestamp).toBe(occurred.toISOString())
  })

  it("passes metadata through", () => {
    const result = mapTimelineEvent(makeEvent({ metadata: { sha: "abc123", pr: "42" } }), "proj")
    expect(result.metadata).toMatchObject({ sha: "abc123", pr: "42" })
  })

  it("handles empty metadata", () => {
    const result = mapTimelineEvent(makeEvent({ metadata: {} }), "proj")
    expect(result.metadata).toBeDefined()
  })

  it("output has correct UI TimelineEvent shape", () => {
    const result = mapTimelineEvent(makeEvent(), "proj")
    expect(result).toMatchObject({
      id: expect.any(String),
      projectSlug: expect.any(String),
      type: expect.any(String),
      description: expect.any(String),
      timestamp: expect.any(String),
    })
  })
})

// ---------------------------------------------------------------------------
// mapProject — activity pulse
// ---------------------------------------------------------------------------

describe("mapProject — activityLevel", () => {
  it("returns active-now when lastActivityAt is within the last hour", () => {
    const p = makeApiProject({ lastActivityAt: msAgo(30 * 60 * 1000) }) // 30m ago
    const result = mapProject(p)
    expect(result.activityLevel).toBe("active-now")
  })

  it("returns today when lastActivityAt is 2 hours ago (< 24h, > 1h)", () => {
    const p = makeApiProject({ lastActivityAt: msAgo(2 * HOUR) })
    const result = mapProject(p)
    expect(result.activityLevel).toBe("today")
  })

  it("returns today when lastActivityAt is exactly 1h + 1ms ago", () => {
    const p = makeApiProject({ lastActivityAt: msAgo(HOUR + 1) })
    const result = mapProject(p)
    expect(result.activityLevel).toBe("today")
  })

  it("returns this-week when lastActivityAt is 3 days ago", () => {
    const p = makeApiProject({ lastActivityAt: msAgo(3 * DAY) })
    const result = mapProject(p)
    expect(result.activityLevel).toBe("this-week")
  })

  it("returns stale when lastActivityAt is 8 days ago", () => {
    const p = makeApiProject({ lastActivityAt: msAgo(8 * DAY) })
    const result = mapProject(p)
    expect(result.activityLevel).toBe("stale")
  })

  it("returns stale when lastActivityAt is null", () => {
    const p = makeApiProject({ lastActivityAt: null })
    const result = mapProject(p)
    expect(result.activityLevel).toBe("stale")
  })

  it("boundary: exactly 1 hour ago is today (not active-now)", () => {
    const p = makeApiProject({ lastActivityAt: msAgo(HOUR) })
    const result = mapProject(p)
    // Edge: >= 1h is "today", < 1h is "active-now"
    expect(["active-now", "today"]).toContain(result.activityLevel)
  })

  it("boundary: exactly 7 days ago is stale", () => {
    const p = makeApiProject({ lastActivityAt: msAgo(WEEK) })
    const result = mapProject(p)
    expect(["this-week", "stale"]).toContain(result.activityLevel)
  })
})

// ---------------------------------------------------------------------------
// mapProject — action-needed flag
// ---------------------------------------------------------------------------

describe("mapProject — actionNeeded flag", () => {
  it("is not set when no PRs and checks passing", () => {
    const p = makeApiProject({
      lastActivityAt: msAgo(HOUR),
      pullRequests: [],
      prds: [],
    })
    const result = mapProject(p)
    expect(result.actionNeeded).toBe(false)
  })

  it("is set when there is an open PR awaiting review", () => {
    const p = makeApiProject({
      pullRequests: [makePR({ status: "review_requested" })],
    })
    const result = mapProject(p)
    expect(result.actionNeeded).toBe(true)
  })

  it("is set when a PR has failing checks", () => {
    const p = makeApiProject({
      pullRequests: [makePR({ status: "open", checkStatus: "failing" })],
    })
    const result = mapProject(p)
    expect(result.actionNeeded).toBe(true)
  })

  it("is set when the project is stale (> 7 days ago)", () => {
    const p = makeApiProject({
      lastActivityAt: msAgo(8 * DAY),
      pullRequests: [],
    })
    const result = mapProject(p)
    expect(result.actionNeeded).toBe(true)
  })

  it("is not set when PR is approved with passing checks", () => {
    const p = makeApiProject({
      pullRequests: [makePR({ status: "approved", checkStatus: "passing" })],
      lastActivityAt: msAgo(HOUR),
    })
    const result = mapProject(p)
    expect(result.actionNeeded).toBe(false)
  })

  it("is not set when PR is merged", () => {
    const p = makeApiProject({
      pullRequests: [makePR({ status: "merged" })],
      lastActivityAt: msAgo(HOUR),
    })
    const result = mapProject(p)
    expect(result.actionNeeded).toBe(false)
  })

  it("is set when PR has changes_requested", () => {
    const p = makeApiProject({
      pullRequests: [makePR({ status: "changes_requested" })],
    })
    const result = mapProject(p)
    expect(result.actionNeeded).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// mapProject — state summary (summaryLine)
// ---------------------------------------------------------------------------

describe("mapProject — summaryLine (SDLC workflow)", () => {
  it("generates summary for active PRD with mixed work items", () => {
    const prd = makePrd({
      title: "Barcode scanning",
      status: "in_progress",
      workItems: [
        makeWorkItem({ status: "done" }),
        makeWorkItem({ id: "wi-2", status: "done" }),
        makeWorkItem({ id: "wi-3", status: "in_progress" }),
        makeWorkItem({ id: "wi-4", status: "todo" }),
        makeWorkItem({ id: "wi-5", status: "todo" }),
      ],
    })
    const p = makeApiProject({ workflow: "sdlc", prds: [prd] })
    const result = mapProject(p)
    expect(result.summaryLine).toMatch(/barcode scanning/i)
    expect(result.summaryLine).toMatch(/2\/5|2 of 5/) // "2/5 items done"
  })

  it("generates summary indicating stale when no PRDs and stale activity", () => {
    const p = makeApiProject({
      workflow: "sdlc",
      prds: [],
      lastActivityAt: msAgo(8 * DAY),
    })
    const result = mapProject(p)
    expect(result.summaryLine).toMatch(/stale/i)
  })

  it("includes 'all done' or similar when all work items are done", () => {
    const prd = makePrd({
      title: "Landing redesign",
      status: "in_progress",
      workItems: [makeWorkItem({ status: "done" }), makeWorkItem({ id: "wi-2", status: "done" })],
    })
    const p = makeApiProject({ workflow: "sdlc", prds: [prd] })
    const result = mapProject(p)
    // Should indicate all items done
    expect(result.summaryLine).toMatch(/2\/2|all done|complete/i)
  })

  it("handles no active PRD — shows queued next PRD", () => {
    const queued = makePrd({ title: "Next big feature", status: "queued", workItems: [] })
    const p = makeApiProject({ workflow: "sdlc", prds: [queued], lastActivityAt: msAgo(DAY) })
    const result = mapProject(p)
    expect(typeof result.summaryLine).toBe("string")
    expect(result.summaryLine.length).toBeGreaterThan(0)
  })

  it("returns non-empty summaryLine even with empty prds array", () => {
    const p = makeApiProject({ workflow: "sdlc", prds: [], lastActivityAt: msAgo(HOUR) })
    const result = mapProject(p)
    expect(typeof result.summaryLine).toBe("string")
    expect(result.summaryLine.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// mapProject — nested PRDs and structure
// ---------------------------------------------------------------------------

describe("mapProject — nested PRDs", () => {
  it("populates activePRD from in_progress prd", () => {
    const prd = makePrd({ status: "in_progress" })
    const p = makeApiProject({ prds: [prd] })
    const result = mapProject(p)
    expect(result.activePRD).toBeDefined()
    expect(result.activePRD?.id).toBe("prd-1")
  })

  it("populates upNextPRDs from queued prds", () => {
    const prd = makePrd({ status: "queued" })
    const p = makeApiProject({ prds: [prd] })
    const result = mapProject(p)
    expect(result.upNextPRDs).toBeDefined()
    expect(result.upNextPRDs?.length).toBeGreaterThan(0)
  })

  it("populates shippedPRDs from completed prds", () => {
    const prd = makePrd({ status: "completed" })
    const p = makeApiProject({ prds: [prd] })
    const result = mapProject(p)
    expect(result.shippedPRDs).toBeDefined()
    expect(result.shippedPRDs?.some((s) => s.id === "prd-1")).toBe(true)
  })

  it("maps workItems within a PRD", () => {
    const prd = makePrd({
      status: "in_progress",
      workItems: [
        makeWorkItem({ id: "wi-a", status: "done" }),
        makeWorkItem({ id: "wi-b", status: "in_progress" }),
      ],
    })
    const p = makeApiProject({ prds: [prd] })
    const result = mapProject(p)
    expect(result.activePRD?.workItems).toHaveLength(2)
    expect(result.activePRD?.workItems[0].status).toBe("done")
    expect(result.activePRD?.workItems[1].status).toBe("in-progress")
  })

  it("handles PRD with null summary gracefully", () => {
    const prd = makePrd({ summary: null })
    const p = makeApiProject({ prds: [prd] })
    expect(() => mapProject(p)).not.toThrow()
    const result = mapProject(p)
    expect(result.activePRD?.summary ?? "").toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// mapProject — null/missing field handling
// ---------------------------------------------------------------------------

describe("mapProject — null/missing field handling", () => {
  it("handles null domain gracefully", () => {
    const p = makeApiProject({ domain: null })
    expect(() => mapProject(p)).not.toThrow()
  })

  it("handles null repoUrl", () => {
    const p = makeApiProject({ repoUrl: null })
    const result = mapProject(p)
    expect(result.repoUrl).toBeDefined()
  })

  it("handles empty tags array", () => {
    const p = makeApiProject({ tags: [] })
    const result = mapProject(p)
    expect(Array.isArray(result.tags)).toBe(true)
  })

  it("handles null lastActivityAt", () => {
    const p = makeApiProject({ lastActivityAt: null })
    const result = mapProject(p)
    expect(result.activityLevel).toBe("stale")
    expect(typeof result.daysSinceActivity).toBe("number")
  })

  it("computes daysSinceActivity correctly for recent activity", () => {
    const p = makeApiProject({ lastActivityAt: msAgo(2 * DAY) })
    const result = mapProject(p)
    expect(result.daysSinceActivity).toBeGreaterThanOrEqual(1)
    expect(result.daysSinceActivity).toBeLessThanOrEqual(3)
  })

  it("computes daysSinceActivity as large number for null lastActivityAt", () => {
    const p = makeApiProject({ lastActivityAt: null })
    const result = mapProject(p)
    expect(result.daysSinceActivity).toBeGreaterThan(7)
  })

  it("output has all required UI Project fields", () => {
    const p = makeApiProject()
    const result = mapProject(p)
    expect(result).toMatchObject({
      slug: expect.any(String),
      name: expect.any(String),
      workflow: expect.stringMatching(/^(sdlc|content)$/),
      tags: expect.any(Array),
      activityLevel: expect.stringMatching(/^(active-now|today|this-week|stale)$/),
      repoUrl: expect.any(String),
      openPRCount: expect.any(Number),
      checkStatus: expect.any(String),
      daysSinceActivity: expect.any(Number),
      summaryLine: expect.any(String),
    })
  })
})

// ---------------------------------------------------------------------------
// mapProject — openPRCount and checkStatus
// ---------------------------------------------------------------------------

describe("mapProject — openPRCount and checkStatus", () => {
  it("counts only open/draft/review_requested PRs", () => {
    const p = makeApiProject({
      pullRequests: [
        makePR({ id: "pr-1", status: "open" }),
        makePR({ id: "pr-2", status: "merged" }),
        makePR({ id: "pr-3", status: "closed" }),
        makePR({ id: "pr-4", status: "draft" }),
      ],
    })
    const result = mapProject(p)
    // open + draft = 2
    expect(result.openPRCount).toBe(2)
  })

  it("returns failing checkStatus when any open PR has failing checks", () => {
    const p = makeApiProject({
      pullRequests: [
        makePR({ status: "open", checkStatus: "failing" }),
        makePR({ id: "pr-2", status: "open", checkStatus: "passing" }),
      ],
    })
    const result = mapProject(p)
    expect(result.checkStatus).toBe("failing")
  })

  it("returns passing when all open PRs pass", () => {
    const p = makeApiProject({
      pullRequests: [makePR({ status: "open", checkStatus: "passing" })],
    })
    const result = mapProject(p)
    expect(result.checkStatus).toBe("passing")
  })

  it("returns pending when a PR has pending checks", () => {
    const p = makeApiProject({
      pullRequests: [makePR({ status: "open", checkStatus: "pending" })],
    })
    const result = mapProject(p)
    expect(result.checkStatus).toBe("pending")
  })

  it("returns passing when there are no open PRs", () => {
    const p = makeApiProject({ pullRequests: [] })
    const result = mapProject(p)
    expect(result.checkStatus).toBe("passing")
  })

  // BUG PROBE: review_requested consistency
  // computeCheckStatus includes review_requested as "open" for check purposes,
  // but computeOpenPRCount does NOT include review_requested in the count.
  // These should be consistent.
  it("counts review_requested PRs in openPRCount (consistency with checkStatus logic)", () => {
    const p = makeApiProject({
      pullRequests: [makePR({ status: "review_requested" })],
    })
    const result = mapProject(p)
    // review_requested is treated as open for check-status (included in open filter),
    // so openPRCount should also reflect it as an open PR
    expect(result.openPRCount).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// mapPR — edge cases not covered by existing tests
// ---------------------------------------------------------------------------

describe("mapPR — edge cases", () => {
  it("maps closed status — should NOT map to merged (closed != merged)", () => {
    // BUG: current impl maps "closed" → "merged" in mapPRStatus, which is incorrect.
    // A closed PR (not merged) is not the same as a merged PR.
    // The UI PRStatus type does not include "closed", so this maps via the switch default
    // or via explicit handling. We verify the status is deterministic.
    const result = mapPR(makePR({ status: "closed" }), "proj")
    // "closed" should map to something other than "merged" — they are distinct states.
    // This test documents the bug: closed is incorrectly mapped to merged.
    expect(result.status).not.toBe("merged")
  })

  it("handles openedAt as a string (API JSON deserialization)", () => {
    // BUG PROBE: mapPR calls pr.openedAt.toISOString(), but when data comes
    // from JSON (fetch → .json()), dates are strings, not Date objects.
    // This would throw "toISOString is not a function" at runtime.
    const prWithStringDate = {
      ...makePR(),
      openedAt: "2026-03-10T00:00:00.000Z" as unknown as Date,
    }
    // If the implementation calls .toISOString() directly on a string, it throws.
    // A correct implementation should guard against this.
    expect(() => mapPR(prWithStringDate, "proj")).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// mapTimelineEvent — edge cases
// ---------------------------------------------------------------------------

describe("mapTimelineEvent — edge cases", () => {
  it("handles occurredAt as a string (API JSON deserialization)", () => {
    // BUG PROBE: mapTimelineEvent calls event.occurredAt.toISOString(), but when
    // data comes from JSON over fetch, dates are strings, not Date objects.
    const eventWithStringDate = {
      ...makeEvent(),
      occurredAt: "2026-03-10T12:00:00.000Z" as unknown as Date,
    }
    expect(() => mapTimelineEvent(eventWithStringDate, "proj")).not.toThrow()
  })

  it("handles null metadata gracefully", () => {
    // metadata is typed as Record<string, unknown> but could be null from DB
    const eventWithNullMeta = {
      ...makeEvent(),
      metadata: null as unknown as Record<string, unknown>,
    }
    expect(() => mapTimelineEvent(eventWithNullMeta, "proj")).not.toThrow()
  })

  it("does not XSS-escape metadata values — caller must sanitize before rendering", () => {
    // The mapper passes metadata through as-is. Values containing <script> tags
    // would need to be sanitized at the render layer.
    const result = mapTimelineEvent(
      makeEvent({ metadata: { msg: "<script>alert(1)</script>" } }),
      "proj",
    )
    // Mapper does not sanitize — the value passes through unchanged.
    // This is acceptable as long as the render layer uses React (which escapes by default).
    expect(result.metadata?.msg).toBe("<script>alert(1)</script>")
  })

  it("handles unknown event types gracefully (passes through)", () => {
    // Events with unknown types pass through via the default case — this is intentional
    // but we verify it doesn't throw or produce undefined
    const result = mapTimelineEvent(
      makeEvent({ type: "unknown_future_event" as ApiEvent["type"] }),
      "proj",
    )
    expect(typeof result.type).toBe("string")
    expect(result.type).toBe("unknown_future_event")
  })
})

// ---------------------------------------------------------------------------
// mapProject — additional edge cases
// ---------------------------------------------------------------------------

describe("mapProject — additional edge cases", () => {
  it("boundary: exactly 1 hour ago is NOT active-now (strict less-than)", () => {
    // computeActivityLevel uses `age < HOUR` for active-now.
    // Exactly HOUR ms ago should be "today", not "active-now".
    const p = makeApiProject({ lastActivityAt: msAgo(HOUR) })
    const result = mapProject(p)
    expect(result.activityLevel).toBe("today")
  })

  it("boundary: exactly 7 days ago is stale (strict less-than for this-week)", () => {
    // computeActivityLevel uses `age < WEEK` for this-week.
    // Exactly WEEK ms ago should be "stale".
    const p = makeApiProject({ lastActivityAt: msAgo(WEEK) })
    const result = mapProject(p)
    expect(result.activityLevel).toBe("stale")
  })

  it("computeActionNeeded: stale threshold is >= WEEK (not > WEEK)", () => {
    // computeActionNeeded checks: Date.now() - lastActivityAt >= WEEK
    // Exactly at the boundary (WEEK) should trigger actionNeeded=true.
    const p = makeApiProject({
      lastActivityAt: msAgo(WEEK),
      pullRequests: [],
    })
    const result = mapProject(p)
    expect(result.actionNeeded).toBe(true)
  })

  it("handles project with empty pullRequests array", () => {
    const p = makeApiProject({ pullRequests: [] })
    expect(() => mapProject(p)).not.toThrow()
    const result = mapProject(p)
    expect(result.openPRCount).toBe(0)
    expect(result.checkStatus).toBe("passing")
  })

  it("handles project with multiple in_progress PRDs — uses first found", () => {
    // Array.find returns the first match; verify behavior is deterministic
    const prd1 = makePrd({ id: "prd-first", title: "First Active", status: "in_progress" })
    const prd2 = makePrd({ id: "prd-second", title: "Second Active", status: "in_progress" })
    const p = makeApiProject({ prds: [prd1, prd2] })
    const result = mapProject(p)
    expect(result.activePRD?.id).toBe("prd-first")
  })

  it("slug uses project.name (not a separate slug field)", () => {
    // mapProject sets slug: project.name — verify this is consistent
    const p = makeApiProject({ name: "my-cool-project" })
    const result = mapProject(p)
    expect(result.slug).toBe("my-cool-project")
    expect(result.name).toBe("my-cool-project")
  })

  it("buildSdlcSummaryLine handles active PRD with zero work items", () => {
    const prd = makePrd({ status: "in_progress", workItems: [], title: "Empty PRD" })
    const p = makeApiProject({ prds: [prd] })
    expect(() => mapProject(p)).not.toThrow()
    const result = mapProject(p)
    // With 0 work items, should return just the title (no "0/0 items done")
    expect(result.summaryLine).toContain("Empty PRD")
  })

  it("handles lastActivityAt as an ISO string (API JSON deserialization)", () => {
    // BUG: When API data comes via JSON.parse, lastActivityAt is a string, not a Date.
    // computeActivityLevel and computeDaysSinceActivity call .getTime() on it — this
    // throws "getTime is not a function" unless coerced first.
    const p = {
      ...makeApiProject(),
      lastActivityAt: new Date(Date.now() - 2 * HOUR).toISOString() as unknown as Date,
    }
    expect(() => mapProject(p)).not.toThrow()
    const result = mapProject(p)
    expect(result.activityLevel).toBe("today")
    expect(result.daysSinceActivity).toBe(0)
  })
})
