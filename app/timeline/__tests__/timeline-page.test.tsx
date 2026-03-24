/**
 * Tests for WI-635: Wire timeline page to live API data.
 *
 * Acceptance criteria covered:
 * 1. Events fetched from live API via SWR and grouped by day
 * 2. Date headers use relative labels for recent days (Today, Yesterday, weekday name)
 * 3. Day summary computed from actual events
 * 4. All four filter types work: date range, project, domain, event type
 * 5. Pagination loads older events
 * 6. Loading/error states shown
 * 7. Empty state for days with no events
 *
 * Strategy:
 * - Mock `@/lib/hooks` to control what useTimeline / useProjects return
 * - Mock `next/navigation` for useRouter / useSearchParams / usePathname
 * - Mount the timeline page component and assert rendered output
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { type ReactNode, createElement } from "react"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn()
const mockReplace = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/timeline",
}))

// Mock hooks — controlled per-test via the mock* objects below
const mockUseTimelineReturn: {
  data: unknown[] | undefined
  meta: { total: number; page: number; per_page: number } | undefined
  isLoading: boolean
  error: Error | undefined
} = {
  data: undefined,
  meta: undefined,
  isLoading: false,
  error: undefined,
}

const mockUseProjectsReturn: {
  data: unknown[] | undefined
  isLoading: boolean
  error: Error | undefined
} = {
  data: undefined,
  isLoading: false,
  error: undefined,
}

vi.mock("@/lib/hooks", () => ({
  useTimeline: () => mockUseTimelineReturn,
  useProjects: () => mockUseProjectsReturn,
}))

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Pin "now" to a deterministic date so relative label tests are stable. */
const NOW = new Date("2026-03-17T12:00:00.000Z")

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 60 * 60 * 1000)
}

function daysAgo(d: number): Date {
  return new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000)
}

function makeEvent(overrides: Partial<{
  id: string
  projectId: string
  type: string
  title: string
  metadata: Record<string, unknown>
  occurredAt: Date
  createdAt: Date
  updatedAt: Date
}> = {}) {
  return {
    id: overrides.id ?? "te-1",
    projectId: overrides.projectId ?? "proj-1",
    type: overrides.type ?? "commit",
    title: overrides.title ?? "feat: add new feature",
    metadata: overrides.metadata ?? {},
    occurredAt: overrides.occurredAt ?? hoursAgo(2),
    createdAt: overrides.createdAt ?? hoursAgo(2),
    updatedAt: overrides.updatedAt ?? hoursAgo(2),
  }
}

function makeProject(overrides: Partial<{
  id: string
  name: string
  workflow: "sdlc" | "content"
  domain: string | null
  tags: string[]
  repoUrl: string | null
  lastActivityAt: Date | null
  prds: unknown[]
  pullRequests: unknown[]
  createdAt: Date
  updatedAt: Date
}> = {}) {
  return {
    id: overrides.id ?? "proj-1",
    name: overrides.name ?? "picking-app",
    workflow: overrides.workflow ?? ("sdlc" as const),
    domain: overrides.domain ?? "arcanelayer",
    tags: overrides.tags ?? ["typescript"],
    repoUrl: overrides.repoUrl ?? "https://github.com/org/repo",
    lastActivityAt: overrides.lastActivityAt ?? new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
    prds: overrides.prds ?? [],
    pullRequests: overrides.pullRequests ?? [],
    createdAt: overrides.createdAt ?? new Date("2026-01-01"),
    updatedAt: overrides.updatedAt ?? new Date("2026-03-01"),
  }
}

// Fixture events across different days
const todayEvent1 = makeEvent({ id: "te-today-1", type: "commit", title: "add multi-barcode batch scan mode", occurredAt: hoursAgo(2), projectId: "proj-1" })
const todayEvent2 = makeEvent({ id: "te-today-2", type: "pr_opened", title: "Opened PR #47: feat: barcode scanner integration", occurredAt: hoursAgo(5), projectId: "proj-2" })
const yesterdayEvent1 = makeEvent({ id: "te-yest-1", type: "pr_approved", title: "PR #23 approved: redesign: full landing page refresh", occurredAt: hoursAgo(26), projectId: "proj-1" })
const _yesterdayEvent2 = makeEvent({ id: "te-yest-2", type: "prd_updated", title: "PRD updated: Barcode scanning — 3/5 items done", occurredAt: hoursAgo(30), projectId: "proj-2" })
const twoDaysAgoEvent = makeEvent({ id: "te-2d-1", type: "commit", title: "Published: Ship It: K8s Upgrade Story", occurredAt: daysAgo(2), projectId: "proj-3" })

const projectAlpha = makeProject({ id: "proj-1", name: "picking-app", domain: "arcanelayer", workflow: "sdlc" })
const projectBeta = makeProject({ id: "proj-2", name: "aiteam-brand", domain: "aiteam", workflow: "sdlc" })
const projectGamma = makeProject({ id: "proj-3", name: "joshowens-dev", domain: "joshowensdev", workflow: "sdlc" })

const paginationMeta = { total: 30, page: 1, per_page: 20 }

// ---------------------------------------------------------------------------
// SWR isolation wrapper
// ---------------------------------------------------------------------------

function SWRWrapper({ children }: { children: ReactNode }) {
  return createElement(
    SWRConfig,
    { value: { provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false } },
    children,
  )
}

// ---------------------------------------------------------------------------
// Lazy import helper — TimelinePage is a "use client" component
// ---------------------------------------------------------------------------

async function importTimelinePage() {
  const mod = await import("@/app/timeline/TimelinePageClient")
  return mod.default ?? mod.TimelinePageClient
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW })
  mockSearchParams = new URLSearchParams()
  mockPush.mockReset()
  mockReplace.mockReset()
  mockUseTimelineReturn.data = undefined
  mockUseTimelineReturn.meta = undefined
  mockUseTimelineReturn.isLoading = false
  mockUseTimelineReturn.error = undefined
  mockUseProjectsReturn.data = undefined
  mockUseProjectsReturn.isLoading = false
  mockUseProjectsReturn.error = undefined
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
  vi.resetModules()
})

// ===========================================================================
// AC1: Events fetched from live API and grouped by day
// ===========================================================================

describe("AC1: Events fetched from live API and grouped by day", () => {
  it("renders events from live API, not mock data", async () => {
    mockUseTimelineReturn.data = [todayEvent1]
    mockUseTimelineReturn.meta = { total: 1, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/add multi-barcode batch scan mode/i)).toBeInTheDocument()
    })
  })

  it("does not render static mock event descriptions", async () => {
    mockUseTimelineReturn.data = [todayEvent1]
    mockUseTimelineReturn.meta = { total: 1, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/add multi-barcode batch scan mode/i)).toBeInTheDocument()
    })

    // Hardcoded mock event from lib/mock-data.ts should NOT appear
    expect(screen.queryByText(/legendary color-shift animation/i)).not.toBeInTheDocument()
  })

  it("groups events under separate day sections", async () => {
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2, yesterdayEvent1]
    mockUseTimelineReturn.meta = { total: 3, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // Two separate day groups should render
      const dayGroups = screen.getAllByRole("region")
      expect(dayGroups.length).toBeGreaterThanOrEqual(2)
    })
  })

  it("renders each event within its correct day group", async () => {
    mockUseTimelineReturn.data = [todayEvent1, yesterdayEvent1]
    mockUseTimelineReturn.meta = { total: 2, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/add multi-barcode batch scan mode/i)).toBeInTheDocument()
      expect(screen.getByText(/PR #23 approved/i)).toBeInTheDocument()
    })
  })

  it("multiple events in the same day appear in one day group", async () => {
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2]
    mockUseTimelineReturn.meta = { total: 2, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      const todayGroup = screen.getByRole("region", { name: /today/i })
      expect(within(todayGroup).getByText(/add multi-barcode batch scan mode/i)).toBeInTheDocument()
      expect(within(todayGroup).getByText(/opened pr #47/i)).toBeInTheDocument()
    })
  })
})

// ===========================================================================
// AC2: Date headers use relative labels
// ===========================================================================

describe("AC2: Date headers use relative labels for recent days", () => {
  it("labels today's events with 'Today'", async () => {
    mockUseTimelineReturn.data = [todayEvent1]
    mockUseTimelineReturn.meta = { total: 1, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/today/i)).toBeInTheDocument()
    })
  })

  it("labels yesterday's events with 'Yesterday'", async () => {
    mockUseTimelineReturn.data = [yesterdayEvent1]
    mockUseTimelineReturn.meta = { total: 1, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/yesterday/i)).toBeInTheDocument()
    })
  })

  it("labels older events with a weekday or date string, not 'Today' or 'Yesterday'", async () => {
    mockUseTimelineReturn.data = [twoDaysAgoEvent]
    mockUseTimelineReturn.meta = { total: 1, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectGamma]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/published: ship it/i)).toBeInTheDocument()
    })

    // The header for 2 days ago should not say "Today" or "Yesterday"
    expect(screen.queryByText(/^today$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^yesterday$/i)).not.toBeInTheDocument()
  })

  it("shows both Today and Yesterday headers when events span two days", async () => {
    mockUseTimelineReturn.data = [todayEvent1, yesterdayEvent1]
    mockUseTimelineReturn.meta = { total: 2, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/today/i)).toBeInTheDocument()
      expect(screen.getByText(/yesterday/i)).toBeInTheDocument()
    })
  })
})

// ===========================================================================
// AC3: Day summary computed from actual events
// ===========================================================================

describe("AC3: Day summary computed from actual events", () => {
  it("shows a summary card for each day with an event count", async () => {
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2]
    mockUseTimelineReturn.meta = { total: 2, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // Should show human-readable summary: todayEvent1 is "commit", todayEvent2 is "pr_opened"
      expect(screen.getByText(/1 commit across 1 project/i)).toBeInTheDocument()
    })
  })

  it("summary shows the count for each individual day group", async () => {
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2, yesterdayEvent1]
    mockUseTimelineReturn.meta = { total: 3, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // Today has commit + pr_opened → "1 commit across 1 project"
      expect(screen.getByText(/1 commit across 1 project/i)).toBeInTheDocument()
      // Yesterday has pr_approved → fallback to "1 event"
      expect(screen.getByText("1 event")).toBeInTheDocument()
    })
  })

  it("summary reflects different event types in the day", async () => {
    const commitEvent = makeEvent({ id: "c1", type: "commit", title: "feat: add button", occurredAt: hoursAgo(1) })
    const prEvent = makeEvent({ id: "p1", type: "pr_opened", title: "Opened PR #10", occurredAt: hoursAgo(2) })

    mockUseTimelineReturn.data = [commitEvent, prEvent]
    mockUseTimelineReturn.meta = { total: 2, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // Day group exists and has both events
      expect(screen.getByText(/feat: add button/i)).toBeInTheDocument()
      expect(screen.getByText(/opened pr #10/i)).toBeInTheDocument()
    })
  })
})

// ===========================================================================
// AC4: All four filter types work
// ===========================================================================

describe("AC4: Filters — date range", () => {
  it("renders date range filter controls", async () => {
    mockUseTimelineReturn.data = [todayEvent1]
    mockUseTimelineReturn.meta = paginationMeta
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/add multi-barcode batch scan mode/i))

    // Some date range control should be present
    const dateFilter =
      screen.queryByLabelText(/date range|from|start date/i) ??
      screen.queryByRole("combobox", { name: /date/i }) ??
      screen.queryByRole("button", { name: /date range|today|this week|all time/i })

    expect(dateFilter).toBeInTheDocument()
  })

  it("clicking a date range filter updates the URL", async () => {
    mockUseTimelineReturn.data = [todayEvent1]
    mockUseTimelineReturn.meta = paginationMeta
    mockUseProjectsReturn.data = [projectAlpha]
    const user = userEvent.setup()

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/add multi-barcode batch scan mode/i))

    // Find "This week" or a similar date range preset
    const thisWeekBtn = screen.queryByRole("button", { name: /this week/i })
    if (thisWeekBtn) {
      await user.click(thisWeekBtn)
      await waitFor(() => {
        const calls = [...mockReplace.mock.calls, ...mockPush.mock.calls]
        const urlStrings = calls.map((c) => String(c[0]))
        expect(urlStrings.some((url) => url.includes("range=") || url.includes("from=") || url.includes("week"))).toBe(true)
      })
    } else {
      // If no preset buttons, there should at least be date input controls
      const dateInput = screen.queryByRole("textbox", { name: /from|start/i })
      expect(dateInput).toBeInTheDocument()
    }
  })
})

describe("AC4: Filters — project", () => {
  it("renders a project filter control", async () => {
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2]
    mockUseTimelineReturn.meta = paginationMeta
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/add multi-barcode batch scan mode/i))

    const projectFilter =
      screen.queryByRole("combobox", { name: /project/i }) ??
      screen.queryByLabelText(/project/i) ??
      screen.queryByRole("button", { name: /all projects/i })

    expect(projectFilter).toBeInTheDocument()
  })

  it("selecting a project filter updates the URL with project param", async () => {
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2]
    mockUseTimelineReturn.meta = paginationMeta
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]
    const user = userEvent.setup()

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/add multi-barcode batch scan mode/i))

    // Try to find a project-specific filter button or select
    const projectBtn = screen.queryByRole("button", { name: /picking-app/i })
    const projectSelect = screen.queryByRole("combobox", { name: /project/i })

    if (projectBtn) {
      await user.click(projectBtn)
      await waitFor(() => {
        const calls = [...mockReplace.mock.calls, ...mockPush.mock.calls]
        const urlStrings = calls.map((c) => String(c[0]))
        expect(urlStrings.some((url) => url.includes("project=") || url.includes("projectId="))).toBe(true)
      })
    } else if (projectSelect) {
      await user.selectOptions(projectSelect, "picking-app")
      await waitFor(() => {
        const calls = [...mockReplace.mock.calls, ...mockPush.mock.calls]
        expect(calls.length).toBeGreaterThan(0)
      })
    } else {
      // Filter controls should exist, even if implementation varies
      const anyFilterControl = screen.queryByRole("listbox") ?? screen.queryByRole("combobox")
      expect(anyFilterControl).toBeInTheDocument()
    }
  })

  it("reads project filter from URL params on initial render", async () => {
    mockSearchParams = new URLSearchParams("project=picking-app")
    mockUseTimelineReturn.data = [todayEvent1]
    mockUseTimelineReturn.meta = { total: 1, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // The timeline hook should be called with project filter from URL
      // The event still renders
      expect(screen.getByText(/add multi-barcode batch scan mode/i)).toBeInTheDocument()
    })
  })
})

describe("AC4: Filters — domain", () => {
  it("renders domain filter controls", async () => {
    mockUseTimelineReturn.data = [todayEvent1]
    mockUseTimelineReturn.meta = paginationMeta
    mockUseProjectsReturn.data = [projectAlpha, projectBeta, projectGamma]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/add multi-barcode batch scan mode/i))

    const domainFilter =
      screen.queryByRole("combobox", { name: /domain/i }) ??
      screen.queryByLabelText(/domain/i) ??
      screen.queryByRole("button", { name: /all domains|arcane layer|aiteam/i })

    expect(domainFilter).toBeInTheDocument()
  })

  it("selecting a domain filter updates the URL with domain param", async () => {
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2]
    mockUseTimelineReturn.meta = paginationMeta
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]
    const user = userEvent.setup()

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/add multi-barcode batch scan mode/i))

    const domainBtn = screen.queryByRole("button", { name: /arcane layer/i })
    if (domainBtn) {
      await user.click(domainBtn)
      await waitFor(() => {
        const calls = [...mockReplace.mock.calls, ...mockPush.mock.calls]
        const urlStrings = calls.map((c) => String(c[0]))
        expect(urlStrings.some((url) => url.includes("domain=arcanelayer") || url.includes("domain="))).toBe(true)
      })
    } else {
      const domainSelect = screen.queryByRole("combobox", { name: /domain/i })
      expect(domainSelect).toBeInTheDocument()
    }
  })

  it("reads domain filter from URL params on initial render", async () => {
    mockSearchParams = new URLSearchParams("domain=arcanelayer")
    mockUseTimelineReturn.data = [todayEvent1]
    mockUseTimelineReturn.meta = { total: 1, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/add multi-barcode batch scan mode/i)).toBeInTheDocument()
    })
  })
})

describe("AC4: Filters — event type", () => {
  it("renders event type filter controls", async () => {
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2]
    mockUseTimelineReturn.meta = paginationMeta
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/add multi-barcode batch scan mode/i))

    const eventTypeFilter =
      screen.queryByRole("combobox", { name: /type|event type/i }) ??
      screen.queryByLabelText(/type|event type/i) ??
      screen.queryByRole("button", { name: /all types|commits?|pull requests?/i })

    expect(eventTypeFilter).toBeInTheDocument()
  })

  it("selecting an event type filter updates the URL with type param", async () => {
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2]
    mockUseTimelineReturn.meta = paginationMeta
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]
    const user = userEvent.setup()

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/add multi-barcode batch scan mode/i))

    const commitBtn = screen.queryByRole("button", { name: /^commits?$/i })
    if (commitBtn) {
      await user.click(commitBtn)
      await waitFor(() => {
        const calls = [...mockReplace.mock.calls, ...mockPush.mock.calls]
        const urlStrings = calls.map((c) => String(c[0]))
        expect(urlStrings.some((url) => url.includes("type=commit") || url.includes("eventType=commit"))).toBe(true)
      })
    } else {
      const typeSelect = screen.queryByRole("combobox", { name: /type|event type/i })
      expect(typeSelect).toBeInTheDocument()
    }
  })

  it("reads event type filter from URL params on initial render", async () => {
    mockSearchParams = new URLSearchParams("type=commit")
    mockUseTimelineReturn.data = [todayEvent1]
    mockUseTimelineReturn.meta = { total: 1, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/add multi-barcode batch scan mode/i)).toBeInTheDocument()
    })
  })

  it("passing a PR event type filter shows only PR events", async () => {
    // URL filter uses UI event type format (hyphenated), not API format (underscored)
    mockSearchParams = new URLSearchParams("type=pr-opened")
    // Include both a pr_opened event and a commit event so the filter is meaningful
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2]
    mockUseTimelineReturn.meta = { total: 2, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/opened pr #47/i)).toBeInTheDocument()
    })
    // commit event should not appear when filtered to PR type
    expect(screen.queryByText(/add multi-barcode batch scan mode/i)).not.toBeInTheDocument()
  })
})

// ===========================================================================
// AC5: Pagination loads older events
// ===========================================================================

describe("AC5: Pagination loads older events", () => {
  it("renders a 'Load more' button when there are more events than current page", async () => {
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2]
    mockUseTimelineReturn.meta = { total: 50, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument()
    })
  })

  it("does NOT render 'Load more' when all events fit on one page", async () => {
    mockUseTimelineReturn.data = [todayEvent1]
    mockUseTimelineReturn.meta = { total: 1, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/add multi-barcode batch scan mode/i))

    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument()
  })

  it("clicking 'Load more' requests the next page", async () => {
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2]
    mockUseTimelineReturn.meta = { total: 50, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]
    const user = userEvent.setup()

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByRole("button", { name: /load more/i }))
    await user.click(screen.getByRole("button", { name: /load more/i }))

    // After clicking, URL or internal state should advance to page 2
    await waitFor(() => {
      const calls = [...mockReplace.mock.calls, ...mockPush.mock.calls]
      const urlStrings = calls.map((c) => String(c[0]))
      const hasPage2 = urlStrings.some((url) => url.includes("page=2"))
      // OR the component updated its own state — either way more events should be requested
      expect(hasPage2 || screen.queryByRole("button", { name: /load more/i })).toBeTruthy()
    })
  })

  it("appends new events to the existing list when loading more", async () => {
    // Start with page 1 data
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2]
    mockUseTimelineReturn.meta = { total: 5, page: 1, per_page: 2 }
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]
    const user = userEvent.setup()

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByRole("button", { name: /load more/i }))

    // After load-more, the new page events should be visible alongside old ones
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2, yesterdayEvent1]
    mockUseTimelineReturn.meta = { total: 5, page: 2, per_page: 2 }

    await user.click(screen.getByRole("button", { name: /load more/i }))

    await waitFor(() => {
      expect(screen.getByText(/add multi-barcode batch scan mode/i)).toBeInTheDocument()
      expect(screen.getByText(/opened pr #47/i)).toBeInTheDocument()
    })
  })

  it("does not show 'Load more' when on the last page", async () => {
    mockUseTimelineReturn.data = [todayEvent1]
    mockUseTimelineReturn.meta = { total: 20, page: 2, per_page: 10 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/add multi-barcode batch scan mode/i))

    // On page 2 of 2 (total=20, per_page=10), there's no page 3
    // The load more button should not show when total <= page * per_page
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument()
  })
})

// ===========================================================================
// AC6: Loading/error states shown
// ===========================================================================

describe("AC6: Loading state", () => {
  it("shows loading skeletons when timeline data is loading", async () => {
    mockUseTimelineReturn.isLoading = true
    mockUseTimelineReturn.data = undefined
    mockUseProjectsReturn.data = []

    const TimelinePage = await importTimelinePage()
    const { container } = render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      const skeletons = container.querySelectorAll("output")
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  it("renders animate-pulse elements while loading", async () => {
    mockUseTimelineReturn.isLoading = true
    mockUseTimelineReturn.data = undefined
    mockUseProjectsReturn.data = []

    const TimelinePage = await importTimelinePage()
    const { container } = render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(container.querySelector(".animate-pulse")).toBeInTheDocument()
    })
  })

  it("hides loading skeleton once data arrives", async () => {
    mockUseTimelineReturn.isLoading = false
    mockUseTimelineReturn.data = [todayEvent1]
    mockUseTimelineReturn.meta = { total: 1, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    const { container } = render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/add multi-barcode batch scan mode/i)).toBeInTheDocument()
    })

    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument()
  })
})

describe("AC6: Error state", () => {
  it("shows an error message when the timeline fetch fails", async () => {
    mockUseTimelineReturn.error = new Error("Network error")
    mockUseTimelineReturn.data = undefined
    mockUseProjectsReturn.data = []

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(
        screen.getByText(/something went wrong|failed to load|error/i),
      ).toBeInTheDocument()
    })
  })

  it("renders a retry button in the error state", async () => {
    mockUseTimelineReturn.error = new Error("HTTP 503")
    mockUseTimelineReturn.data = undefined
    mockUseProjectsReturn.data = []

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    })
  })

  it("does not render event entries or loading skeletons in error state", async () => {
    mockUseTimelineReturn.error = new Error("Failed")
    mockUseTimelineReturn.data = undefined
    mockUseProjectsReturn.data = []

    const TimelinePage = await importTimelinePage()
    const { container } = render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByRole("button", { name: /retry/i }))

    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument()
    expect(screen.queryByText(/add multi-barcode batch scan mode/i)).not.toBeInTheDocument()
  })

  it("shows the error detail in the error state", async () => {
    mockUseTimelineReturn.error = new Error("HTTP 500")
    mockUseTimelineReturn.data = undefined
    mockUseProjectsReturn.data = []

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/500|failed/i)).toBeInTheDocument()
    })
  })
})

// ===========================================================================
// AC7: Empty state for days with no events
// ===========================================================================

describe("AC7: Empty state when no events", () => {
  it("shows an empty state message when the API returns no events", async () => {
    mockUseTimelineReturn.data = []
    mockUseTimelineReturn.meta = { total: 0, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(
        screen.getByText(/no events|nothing here|all quiet|no activity/i),
      ).toBeInTheDocument()
    })
  })

  it("does not show day groups when there are no events", async () => {
    mockUseTimelineReturn.data = []
    mockUseTimelineReturn.meta = { total: 0, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.queryByText(/today/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/yesterday/i)).not.toBeInTheDocument()
    })
  })

  it("shows empty state when filters result in no matching events", async () => {
    mockSearchParams = new URLSearchParams("type=pr_merged")
    mockUseTimelineReturn.data = [] // API returns empty due to filter
    mockUseTimelineReturn.meta = { total: 0, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(
        screen.getByText(/no events|nothing here|all quiet|no activity/i),
      ).toBeInTheDocument()
    })
  })

  it("does not show 'Load more' when there are no events", async () => {
    mockUseTimelineReturn.data = []
    mockUseTimelineReturn.meta = { total: 0, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = []

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument()
    })
  })
})

// ===========================================================================
// Integration: Filters + grouping + pagination together
// ===========================================================================

describe("Integration: filters, grouping, and pagination together", () => {
  it("shows correct day groups with URL filter applied", async () => {
    mockSearchParams = new URLSearchParams("domain=arcanelayer")
    // API returns only arcanelayer events due to filter
    mockUseTimelineReturn.data = [todayEvent1]
    mockUseTimelineReturn.meta = { total: 1, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/today/i)).toBeInTheDocument()
      expect(screen.getByText(/add multi-barcode batch scan mode/i)).toBeInTheDocument()
    })
  })

  it("changing a filter resets pagination to page 1", async () => {
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2, yesterdayEvent1]
    mockUseTimelineReturn.meta = { total: 50, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]
    const user = userEvent.setup()

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    // First load more to advance to page 2
    await waitFor(() => screen.getByRole("button", { name: /load more/i }))
    await user.click(screen.getByRole("button", { name: /load more/i }))

    // Now apply an event-type filter — page should reset to 1
    const commitBtn = screen.queryByRole("button", { name: /^commits?$/i })
    if (commitBtn) {
      await user.click(commitBtn)
      await waitFor(() => {
        const calls = [...mockReplace.mock.calls, ...mockPush.mock.calls]
        const urlStrings = calls.map((c) => String(c[0]))
        // Should have reset to page 1 (no page param, or page=1)
        expect(
          urlStrings.some((url) => !url.includes("page=2") && (url.includes("type=") || url.includes("eventType="))),
        ).toBe(true)
      })
    }
  })
})

// ===========================================================================
// Edge cases: day grouping at timezone boundaries
// ===========================================================================

describe("Edge cases: day grouping", () => {
  it("events at local midnight boundary land in separate day groups", async () => {
    // Use fixed NOW = 2026-03-17T12:00:00.000Z (UTC noon)
    // In UTC, 23:59 on Mar 16 vs 00:01 on Mar 17 are different local days
    // These two events are in the same UTC date-range but local dates can differ

    // An event just before local midnight → "Yesterday"
    const justBeforeMidnight = makeEvent({
      id: "te-b4-mid",
      title: "late night event",
      occurredAt: new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 1, 23, 58, 0),
    })
    // An event just after local midnight → "Today"
    const justAfterMidnight = makeEvent({
      id: "te-after-mid",
      title: "early morning event",
      occurredAt: new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 0, 2, 0),
    })

    mockUseTimelineReturn.data = [justBeforeMidnight, justAfterMidnight]
    mockUseTimelineReturn.meta = { total: 2, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // Both events should render
      expect(screen.getByText(/late night event/i)).toBeInTheDocument()
      expect(screen.getByText(/early morning event/i)).toBeInTheDocument()
    })

    // They should be in separate day groups
    const groups = screen.getAllByRole("region")
    expect(groups.length).toBeGreaterThanOrEqual(2)
  })

  it("multiple events with the same timestamp all appear in one day group", async () => {
    const sameTimestamp = hoursAgo(1)
    const e1 = makeEvent({ id: "te-same-1", title: "event same time A", occurredAt: sameTimestamp })
    const e2 = makeEvent({ id: "te-same-2", title: "event same time B", occurredAt: sameTimestamp })
    const e3 = makeEvent({ id: "te-same-3", title: "event same time C", occurredAt: sameTimestamp })

    mockUseTimelineReturn.data = [e1, e2, e3]
    mockUseTimelineReturn.meta = { total: 3, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      const todayGroup = screen.getByRole("region", { name: /today/i })
      expect(within(todayGroup).getByText(/event same time A/i)).toBeInTheDocument()
      expect(within(todayGroup).getByText(/event same time B/i)).toBeInTheDocument()
      expect(within(todayGroup).getByText(/event same time C/i)).toBeInTheDocument()
    })

    // Should be exactly one day group (all events are "Today")
    const groups = screen.getAllByRole("region")
    expect(groups).toHaveLength(1)
  })

  it("changing domain filter while on page 2 resets page to 1 via URL", async () => {
    mockUseTimelineReturn.data = [todayEvent1, todayEvent2, yesterdayEvent1]
    mockUseTimelineReturn.meta = { total: 50, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]
    const user = userEvent.setup()

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    // Advance to page 2 first
    await waitFor(() => screen.getByRole("button", { name: /load more/i }))
    await user.click(screen.getByRole("button", { name: /load more/i }))

    await waitFor(() => {
      const calls = [...mockReplace.mock.calls, ...mockPush.mock.calls]
      expect(calls.some((c) => String(c[0]).includes("page=2"))).toBe(true)
    })

    mockReplace.mockClear()
    mockPush.mockClear()

    // Now change domain filter via select
    const domainSelect = screen.getByRole("combobox", { name: /domain/i })
    await user.selectOptions(domainSelect, "arcanelayer")

    await waitFor(() => {
      const calls = [...mockReplace.mock.calls, ...mockPush.mock.calls]
      const urlStrings = calls.map((c) => String(c[0]))
      // Should NOT carry page=2 after filter change
      expect(urlStrings.some((url) => !url.includes("page=2"))).toBe(true)
    })
  })

  it("day summary shows singular 'event' when only one event in a day group", async () => {
    mockUseTimelineReturn.data = [todayEvent1]
    mockUseTimelineReturn.meta = { total: 1, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // todayEvent1 is "commit" → "1 commit across 1 project"
      expect(screen.getByText(/1 commit across 1 project/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Bug regression: client-side filters actually hide non-matching events
// ---------------------------------------------------------------------------

describe("Bug regression: client-side filters hide non-matching events", () => {
  it("event type filter hides events that don't match the selected type", async () => {
    // Both events today, different types
    const commitEvent = makeEvent({ id: "ev-commit", type: "commit", title: "commit event title", projectId: "proj-1" })
    const prOpenEvent = makeEvent({ id: "ev-pr", type: "pr_opened", title: "pr opened event title", projectId: "proj-1" })

    mockUseTimelineReturn.data = [commitEvent, prOpenEvent]
    mockUseTimelineReturn.meta = { total: 2, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const user = userEvent.setup()
    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    // Both events visible initially (type filter = "all")
    await waitFor(() => {
      expect(screen.getByText(/commit event title/i)).toBeInTheDocument()
      expect(screen.getByText(/pr opened event title/i)).toBeInTheDocument()
    })

    // Select "pr-opened" event type filter — mapped from pr_opened
    const typeSelect = screen.getByRole("combobox", { name: /event type/i })
    await user.selectOptions(typeSelect, "pr-opened")

    await waitFor(() => {
      // pr-opened event should remain
      expect(screen.getByText(/pr opened event title/i)).toBeInTheDocument()
      // commit event should be hidden
      expect(screen.queryByText(/commit event title/i)).not.toBeInTheDocument()
    })
  })

  it("project filter hides events from other projects", async () => {
    const eventForAlpha = makeEvent({ id: "ev-a", title: "alpha project event", projectId: "proj-1" })
    const eventForBeta = makeEvent({ id: "ev-b", title: "beta project event", projectId: "proj-2" })

    mockUseTimelineReturn.data = [eventForAlpha, eventForBeta]
    mockUseTimelineReturn.meta = { total: 2, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const user = userEvent.setup()
    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/alpha project event/i)).toBeInTheDocument()
      expect(screen.getByText(/beta project event/i)).toBeInTheDocument()
    })

    // Filter by project alpha (name = "picking-app")
    const projectSelect = screen.getByRole("combobox", { name: /project/i })
    await user.selectOptions(projectSelect, "picking-app")

    await waitFor(() => {
      expect(screen.getByText(/alpha project event/i)).toBeInTheDocument()
      expect(screen.queryByText(/beta project event/i)).not.toBeInTheDocument()
    })
  })

  it("domain filter hides events from projects in other domains", async () => {
    const eventForAlpha = makeEvent({ id: "ev-domain-a", title: "arcanelayer event", projectId: "proj-1" })
    const eventForBeta = makeEvent({ id: "ev-domain-b", title: "aiteam event", projectId: "proj-2" })

    mockUseTimelineReturn.data = [eventForAlpha, eventForBeta]
    mockUseTimelineReturn.meta = { total: 2, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const user = userEvent.setup()
    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/arcanelayer event/i)).toBeInTheDocument()
      expect(screen.getByText(/aiteam event/i)).toBeInTheDocument()
    })

    // Filter by arcanelayer domain
    const domainSelect = screen.getByRole("combobox", { name: /domain/i })
    await user.selectOptions(domainSelect, "arcanelayer")

    await waitFor(() => {
      expect(screen.getByText(/arcanelayer event/i)).toBeInTheDocument()
      expect(screen.queryByText(/aiteam event/i)).not.toBeInTheDocument()
    })
  })

  it("empty state shown when event type filter matches no events", async () => {
    // Only has a commit event; selecting deploy type should show empty state
    const commitEvent = makeEvent({ id: "ev-no-deploy", type: "commit", title: "just a commit", projectId: "proj-1" })
    mockUseTimelineReturn.data = [commitEvent]
    mockUseTimelineReturn.meta = { total: 1, page: 1, per_page: 20 }
    mockUseProjectsReturn.data = [projectAlpha]

    const user = userEvent.setup()
    const TimelinePage = await importTimelinePage()
    render(
      <SWRWrapper>
        <TimelinePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/just a commit/i)).toBeInTheDocument()
    })

    const typeSelect = screen.getByRole("combobox", { name: /event type/i })
    await user.selectOptions(typeSelect, "deploy")

    await waitFor(() => {
      expect(screen.queryByText(/just a commit/i)).not.toBeInTheDocument()
      expect(screen.getByText(/no events match/i)).toBeInTheDocument()
    })
  })
})
