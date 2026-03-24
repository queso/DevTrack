/**
 * Tests for WI-633: Wire project summary page to live API data.
 *
 * The project summary page (app/projects/[slug]/ProjectPageClient.tsx) must
 * replace static mock data with SWR-driven data fetched from:
 *   GET /api/v1/projects/:slug   → project metadata + PRDs + PRs
 *   GET /api/v1/events           → timeline events (paginated, filtered)
 *
 * Sections under test:
 *   1. Header         — project name, repo link, deploy URL, health indicators
 *   2. Current Work   — active PRD, work items, progress bar, branch/PR status
 *   3. Pipeline       — SDLC variant (up next, shipped) OR Content variant
 *                       (ideas, drafts, published) based on workflowType
 *   4. Activity       — timeline with event-type filter and load-more pagination
 *   5. Loading states — skeletons per section while data is in flight
 *   6. Error states   — per-section error with retry
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProjectPageClient } from "@/app/projects/[slug]/ProjectPageClient"

// ---------------------------------------------------------------------------
// Mock SWR hooks — tests control what the hooks return
// ---------------------------------------------------------------------------

const mockUseProject = vi.fn()
const mockUseTimeline = vi.fn()

vi.mock("@/lib/hooks", () => ({
  useProject: (...args: unknown[]) => mockUseProject(...args),
  useTimeline: (...args: unknown[]) => mockUseTimeline(...args),
  useActivity: vi.fn(() => ({ data: undefined, error: undefined, isLoading: false, meta: undefined })),
}))

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const SLUG = "picking-app"

const sdlcProject = {
  id: "proj-1",
  name: "picking-app",
  workflow: "sdlc" as const,
  domain: "arcanelayer",
  tags: ["warehouse", "mobile"],
  repoUrl: "https://github.com/arcanelayer/picking-app",
  deployUrl: "https://picking.arcanelayer.com",
  lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
  prds: [
    {
      id: "prd-1",
      title: "Barcode scanning support",
      summary: "Integrate native barcode scanner into the picking workflow.",
      status: "in_progress" as const,
      workItems: [
        { id: "wi-1", title: "Camera permission handling", status: "done" as const },
        { id: "wi-2", title: "Barcode decoder library integration", status: "done" as const },
        { id: "wi-3", title: "Scan-to-confirm UX flow", status: "done" as const },
        { id: "wi-4", title: "Multi-barcode batch mode", status: "in_progress" as const },
        { id: "wi-5", title: "Offline scan queue + sync", status: "pending" as const },
      ],
    },
    {
      id: "prd-2",
      title: "Batch picking optimization",
      summary: "Allow pickers to handle multiple orders simultaneously.",
      status: "queued" as const,
      workItems: [],
    },
    {
      id: "prd-0",
      title: "Pick list filtering",
      summary: "Filter pick lists by zone, priority, and item type.",
      status: "completed" as const,
      workItems: [],
    },
  ],
  pullRequests: [
    {
      id: "pr-1",
      number: 47,
      title: "feat: barcode scanner integration",
      branch_id: "feature/barcode-scanning",
      status: "open" as const,
      check_status: "passing" as const,
      opened_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      url: "https://github.com/arcanelayer/picking-app/pull/47",
      author: "joshowens",
    },
  ],
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date(),
}

const timelineEvents = [
  {
    id: "te-1",
    projectId: "proj-1",
    type: "pr_opened" as const,
    title: "Opened PR #47: feat: barcode scanner integration",
    metadata: { pr: "47" },
    occurredAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "te-2",
    projectId: "proj-1",
    type: "prd_updated" as const,
    title: "PRD updated: Barcode scanning support — 3/5 items done",
    metadata: {},
    occurredAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

const paginationMeta = { total: 20, page: 1, per_page: 10 }

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockUseProject.mockReturnValue({ data: undefined, error: undefined, isLoading: true, meta: undefined })
  mockUseTimeline.mockReturnValue({ data: undefined, error: undefined, isLoading: true, meta: undefined })
})

afterEach(() => {
  vi.clearAllMocks()
})

// ===========================================================================
// 1. Section: Header
// ===========================================================================

describe("Project page — header section", () => {
  it("displays the project name from API data", async () => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: [], error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.getByRole("heading", { name: /picking-app/i })).toBeInTheDocument()
  })

  it("renders a link to the repo URL", async () => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: [], error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    const repoLink = screen.getByRole("link", { name: /github/i })
    expect(repoLink).toHaveAttribute("href", sdlcProject.repoUrl)
  })

  it("renders a link to the deploy URL when present", async () => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: [], error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    const deployLink = screen.getByRole("link", { name: /deploy/i })
    expect(deployLink).toHaveAttribute("href", sdlcProject.deployUrl)
  })

  it("does not render a deploy link when deployUrl is absent", async () => {
    const projectWithoutDeploy = { ...sdlcProject, deployUrl: undefined }
    mockUseProject.mockReturnValue({ data: projectWithoutDeploy, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: [], error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.queryByRole("link", { name: /deploy/i })).not.toBeInTheDocument()
  })

  it("shows a passing check-status health indicator when PRs are green", async () => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: [], error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.getByText(/passing/i)).toBeInTheDocument()
  })

  it("shows a failing check-status indicator when a PR check is failing", async () => {
    const failingProject = {
      ...sdlcProject,
      pullRequests: [
        { ...sdlcProject.pullRequests[0], check_status: "failing" as const },
      ],
    }
    mockUseProject.mockReturnValue({ data: failingProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: [], error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.getByText(/failing/i)).toBeInTheDocument()
  })

  it("passes slug to useProject hook", async () => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: [], error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    expect(mockUseProject).toHaveBeenCalledWith(SLUG, expect.anything())
  })
})

// ===========================================================================
// 2. Section: Current Work (SDLC)
// ===========================================================================

describe("Project page — current work section (SDLC)", () => {
  beforeEach(() => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: timelineEvents, error: undefined, isLoading: false, meta: paginationMeta })
  })

  it("displays the active PRD title", async () => {
    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.getByText(/barcode scanning support/i)).toBeInTheDocument()
  })

  it("renders each work item title", async () => {
    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.getByText(/camera permission handling/i)).toBeInTheDocument()
    expect(screen.getByText(/barcode decoder library integration/i)).toBeInTheDocument()
    expect(screen.getByText(/offline scan queue/i)).toBeInTheDocument()
  })

  it("shows the correct progress bar completion (3 of 5 done = 60%)", async () => {
    render(<ProjectPageClient slug={SLUG} />)

    const progressEl = screen.getByRole("progressbar")
    expect(progressEl).toBeInTheDocument()

    // The aria-valuenow should be 60 (percentage) or 3 (count)
    const valuenow = Number(progressEl.getAttribute("aria-valuenow"))
    expect(valuenow === 60 || valuenow === 3).toBe(true)
  })

  it("renders branch name from the active PR", async () => {
    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.getByText(/feature\/barcode-scanning/i)).toBeInTheDocument()
  })

  it("renders the open PR number and title", async () => {
    render(<ProjectPageClient slug={SLUG} />)

    const currentWork = screen.getByRole("region", { name: /current work/i })
    expect(within(currentWork).getByText(/#47/)).toBeInTheDocument()
    expect(within(currentWork).getByText(/feat: barcode scanner integration/i)).toBeInTheDocument()
  })

  it("links the PR to its URL", async () => {
    render(<ProjectPageClient slug={SLUG} />)

    const prLink = screen.getByRole("link", { name: /#47/ })
    expect(prLink).toHaveAttribute("href", sdlcProject.pullRequests[0].url)
  })

  it("shows 100% progress when all work items are done", async () => {
    const allDoneProject = {
      ...sdlcProject,
      prds: [
        {
          ...sdlcProject.prds[0],
          workItems: sdlcProject.prds[0].workItems.map((wi) => ({ ...wi, status: "done" as const })),
        },
      ],
    }
    mockUseProject.mockReturnValue({ data: allDoneProject, error: undefined, isLoading: false, meta: undefined })

    render(<ProjectPageClient slug={SLUG} />)

    const progressEl = screen.getByRole("progressbar")
    const valuenow = Number(progressEl.getAttribute("aria-valuenow"))
    expect(valuenow === 100 || valuenow === 5).toBe(true)
  })

  it("shows 0% progress when no work items are done", async () => {
    const noDoneProject = {
      ...sdlcProject,
      prds: [
        {
          ...sdlcProject.prds[0],
          workItems: sdlcProject.prds[0].workItems.map((wi) => ({ ...wi, status: "pending" as const })),
        },
      ],
    }
    mockUseProject.mockReturnValue({ data: noDoneProject, error: undefined, isLoading: false, meta: undefined })

    render(<ProjectPageClient slug={SLUG} />)

    const progressEl = screen.getByRole("progressbar")
    const valuenow = Number(progressEl.getAttribute("aria-valuenow"))
    expect(valuenow === 0).toBe(true)
  })
})

// ===========================================================================
// 3. Section: Pipeline — SDLC variant
// ===========================================================================

describe("Project page — pipeline section (SDLC workflow)", () => {
  beforeEach(() => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: [], error: undefined, isLoading: false, meta: paginationMeta })
  })

  it("renders the 'Up Next' PRD queue", async () => {
    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.getByText(/batch picking optimization/i)).toBeInTheDocument()
  })

  it("renders the 'Shipped' PRD list", async () => {
    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.getByText(/pick list filtering/i)).toBeInTheDocument()
  })

  it("does NOT render content-workflow UI (Ideas/Drafts/Published) for SDLC projects", async () => {
    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.queryByText(/ideas/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/drafts in progress/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/recently published/i)).not.toBeInTheDocument()
  })
})

// ===========================================================================
// 4. Section: Activity timeline
// ===========================================================================

describe("Project page — activity timeline", () => {
  it("renders timeline events from API data", async () => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: timelineEvents, error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.getByText(/opened pr #47/i)).toBeInTheDocument()
    expect(screen.getByText(/prd updated.*barcode scanning support/i)).toBeInTheDocument()
  })

  it("passes project_id filter to useTimeline", async () => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: timelineEvents, error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    expect(mockUseTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: expect.any(String) }),
      expect.anything(),
    )
  })

  it("shows a 'Load more' button when there are more events than current page", async () => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    // total: 20, per_page: 10 — there are more events to load
    mockUseTimeline.mockReturnValue({ data: timelineEvents, error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument()
  })

  it("does NOT show 'Load more' when all events fit on the current page", async () => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    // total equals number of events — no more pages
    mockUseTimeline.mockReturnValue({ data: timelineEvents, error: undefined, isLoading: false, meta: { total: 2, page: 1, per_page: 10 } })

    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument()
  })

  it("loads the next page when 'Load more' is clicked", async () => {
    const user = userEvent.setup()
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: timelineEvents, error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    const loadMoreBtn = screen.getByRole("button", { name: /load more/i })
    await user.click(loadMoreBtn)

    // After clicking, the hook should be called with page 2
    await waitFor(() => {
      expect(mockUseTimeline).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.anything(),
      )
    })
  })
})

// ===========================================================================
// 6. Event type filter
// ===========================================================================

describe("Project page — event type filter", () => {
  it("renders event type filter controls", async () => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: timelineEvents, error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    // There should be filter options (buttons, tabs, or a select)
    const filterEl =
      screen.queryByRole("group", { name: /filter/i }) ??
      screen.queryByLabelText(/filter/i) ??
      screen.queryByRole("combobox")

    expect(filterEl).toBeInTheDocument()
  })

  it("passes event type filter to useTimeline when a filter is selected", async () => {
    const user = userEvent.setup()
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: timelineEvents, error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    // Find and click a PR-specific event type filter
    const prFilter = screen.getByRole("button", { name: /pull request|pr/i })
    await user.click(prFilter)

    await waitFor(() => {
      expect(mockUseTimeline).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: expect.stringMatching(/pr/) }),
        expect.anything(),
      )
    })
  })

  it("resets pagination to page 1 when event type filter changes", async () => {
    const user = userEvent.setup()
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: timelineEvents, error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    // First advance to page 2
    const loadMoreBtn = screen.getByRole("button", { name: /load more/i })
    await user.click(loadMoreBtn)

    // Then change filter — page should reset to 1
    const prFilter = screen.getByRole("button", { name: /pull request|pr/i })
    await user.click(prFilter)

    await waitFor(() => {
      expect(mockUseTimeline).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, eventType: expect.anything() }),
        expect.anything(),
      )
    })
  })
})

// ===========================================================================
// 7. Loading states
// ===========================================================================

describe("Project page — loading states", () => {
  it("shows skeleton elements while project data is loading", async () => {
    mockUseProject.mockReturnValue({ data: undefined, error: undefined, isLoading: true, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: undefined, error: undefined, isLoading: true, meta: undefined })

    render(<ProjectPageClient slug={SLUG} />)

    // Loading skeletons carry role="status"
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0)
  })

  it("shows multiple skeleton areas while all data is loading", async () => {
    mockUseProject.mockReturnValue({ data: undefined, error: undefined, isLoading: true, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: undefined, error: undefined, isLoading: true, meta: undefined })

    render(<ProjectPageClient slug={SLUG} />)

    const statuses = screen.getAllByRole("status")
    expect(statuses.length).toBeGreaterThanOrEqual(2)
  })

  it("shows a timeline skeleton while timeline data is loading but project data is ready", async () => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: undefined, error: undefined, isLoading: true, meta: undefined })

    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.getAllByRole("status").length).toBeGreaterThan(0)
  })

  it("removes skeletons and shows content once data loads", async () => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: timelineEvents, error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /picking-app/i })).toBeInTheDocument()
    })

    // No loading skeletons should remain
    expect(screen.queryAllByRole("status").length).toBe(0)
  })
})

// ===========================================================================
// 8. Error states
// ===========================================================================

describe("Project page — error states", () => {
  it("shows an error state when the project data fetch fails", async () => {
    mockUseProject.mockReturnValue({
      data: undefined,
      error: new Error("HTTP 500"),
      isLoading: false,
      meta: undefined,
    })
    mockUseTimeline.mockReturnValue({ data: undefined, error: undefined, isLoading: false, meta: undefined })

    render(<ProjectPageClient slug={SLUG} />)

    expect(
      screen.getByText(/something went wrong|failed to load|error/i)
    ).toBeInTheDocument()
  })

  it("shows an error state for the timeline when timeline fetch fails", async () => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({
      data: undefined,
      error: new Error("HTTP 503"),
      isLoading: false,
      meta: undefined,
    })

    render(<ProjectPageClient slug={SLUG} />)

    // The project header should still render
    expect(screen.getByRole("heading", { name: /picking-app/i })).toBeInTheDocument()
    // But the timeline section should show an error
    expect(
      screen.getByText(/something went wrong|failed to load|error/i)
    ).toBeInTheDocument()
  })

  it("shows a retry button in the project error state", async () => {
    mockUseProject.mockReturnValue({
      data: undefined,
      error: new Error("HTTP 500"),
      isLoading: false,
      meta: undefined,
    })
    mockUseTimeline.mockReturnValue({ data: undefined, error: undefined, isLoading: false, meta: undefined })

    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
  })

  it("shows a not-found message for HTTP 404 project errors", async () => {
    const notFoundError = Object.assign(new Error("HTTP 404"), { status: 404 })
    mockUseProject.mockReturnValue({
      data: undefined,
      error: notFoundError,
      isLoading: false,
      meta: undefined,
    })
    mockUseTimeline.mockReturnValue({ data: undefined, error: undefined, isLoading: false, meta: undefined })

    render(<ProjectPageClient slug={SLUG} />)

    expect(
      screen.getByText(/not found|does not exist|404/i)
    ).toBeInTheDocument()
  })
})

// ===========================================================================
// 9. Health indicator computation
// ===========================================================================

describe("Project page — health indicator computation", () => {
  it("shows 'action needed' indicator when a PR has failing checks", async () => {
    const failingCheckProject = {
      ...sdlcProject,
      pullRequests: [
        { ...sdlcProject.pullRequests[0], check_status: "failing" as const },
      ],
    }
    mockUseProject.mockReturnValue({ data: failingCheckProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: [], error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.getByText(/action needed|attention/i)).toBeInTheDocument()
  })

  it("shows 'action needed' indicator when a PR has changes requested", async () => {
    const changesRequestedProject = {
      ...sdlcProject,
      pullRequests: [
        { ...sdlcProject.pullRequests[0], status: "changes_requested" as const },
      ],
    }
    mockUseProject.mockReturnValue({ data: changesRequestedProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: [], error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.getByText(/action needed|attention/i)).toBeInTheDocument()
  })

  it("shows open PR count from API data", async () => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: [], error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    // 1 open PR in fixture data
    expect(screen.getByText(/1 (open )?pr/i)).toBeInTheDocument()
  })

  it("shows 0 open PRs when no PRs are open", async () => {
    const noPRProject = { ...sdlcProject, pullRequests: [] }
    mockUseProject.mockReturnValue({ data: noPRProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: [], error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    expect(screen.getByText(/0 (open )?pr/i)).toBeInTheDocument()
  })
})

// ===========================================================================
// 10. Timeline projectId deferral
// ===========================================================================

describe("Project page — timeline defers until project id is available", () => {
  it("does not call useTimeline with the slug string while project is loading", () => {
    // Project is still loading — rawProject is undefined.
    mockUseProject.mockReturnValue({ data: undefined, error: undefined, isLoading: true, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: undefined, error: undefined, isLoading: false, meta: undefined })

    render(<ProjectPageClient slug={SLUG} />)

    // useTimeline must not have received projectId equal to the slug string.
    const calls = mockUseTimeline.mock.calls
    for (const [opts] of calls) {
      // When project is loading, opts should be undefined (deferred).
      expect(opts).toBeUndefined()
    }
  })

  it("calls useTimeline with the real project id once project data is ready", () => {
    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })
    mockUseTimeline.mockReturnValue({ data: [], error: undefined, isLoading: false, meta: paginationMeta })

    render(<ProjectPageClient slug={SLUG} />)

    expect(mockUseTimeline).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: sdlcProject.id }),
      expect.anything(),
    )
  })
})

// ===========================================================================
// 11. Load more accumulates events (not replaces)
// ===========================================================================

describe("Project page — load more appends events", () => {
  it("shows events from all loaded pages after clicking load more", async () => {
    const user = userEvent.setup()
    const page2Events = [
      {
        id: "te-3",
        projectId: "proj-1",
        type: "deploy" as const,
        title: "Deployed to production",
        metadata: {},
        occurredAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    mockUseProject.mockReturnValue({ data: sdlcProject, error: undefined, isLoading: false, meta: undefined })

    // First call: page 1, second call: page 2
    mockUseTimeline
      .mockReturnValueOnce({ data: timelineEvents, error: undefined, isLoading: false, meta: paginationMeta })
      .mockReturnValue({ data: page2Events, error: undefined, isLoading: false, meta: { total: 20, page: 2, per_page: 10 } })

    render(<ProjectPageClient slug={SLUG} />)

    // Page 1 events are visible initially
    expect(screen.getByText(/opened pr #47/i)).toBeInTheDocument()

    const loadMoreBtn = screen.getByRole("button", { name: /load more/i })
    await user.click(loadMoreBtn)

    // After load more, both page 1 and page 2 events should be visible
    await waitFor(() => {
      expect(screen.getByText(/opened pr #47/i)).toBeInTheDocument()
      expect(screen.getByText(/deployed to production/i)).toBeInTheDocument()
    })
  })
})
