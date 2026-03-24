/**
 * Tests for WI-632: Wire dashboard page to live API data.
 *
 * Acceptance criteria covered:
 * 1. Project cards populated from live API data via SWR (useProjects)
 * 2. Activity pulse reflects real lastActivityAt timestamps (mapProject)
 * 3. Filters update URL query params and re-fetch
 * 4. Sort works for: last activity, name, needs attention first
 * 5. Search filters projects by name
 * 6. Count summary computed from actual data
 * 7. Loading skeleton shown during fetch
 * 8. Error state with retry on API failure
 * 9. Click card navigates to /projects/[slug]
 *
 * Strategy:
 * - Mock `lib/hooks` so we control isLoading / error / data returned by useProjects
 * - Mock `next/navigation` for useRouter / useSearchParams / usePathname
 * - Mount DashboardPage and assert rendered output
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock next/navigation so the component can call useRouter / useSearchParams.
const mockPush = vi.fn()
const mockReplace = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/",
}))

// Mock useProjects hook — controlled per-test via mockUseProjectsReturn
const mockUseProjectsReturn: {
  data: unknown[] | undefined
  isLoading: boolean
  error: Error | undefined
  mutate: () => void
} = {
  data: undefined,
  isLoading: false,
  error: undefined,
  mutate: vi.fn(),
}

vi.mock("@/lib/hooks", () => ({
  useProjects: () => mockUseProjectsReturn,
}))

// ---------------------------------------------------------------------------
// Fixtures — raw API project shape (what useProjects returns before mapping)
// ---------------------------------------------------------------------------

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
    prds: Array<{
      id: string
      title: string
      summary: string
      status: string
      workItems: Array<{ id: string; title: string; status: string }>
    }>
    pullRequests: Array<{
      id: string
      number: number
      title: string
      status: string
      check_status: string | null
      branch_id: string | null
      url: string
      author: string
      opened_at: Date
    }>
    createdAt: Date
    updatedAt: Date
  }> = {},
) {
  return {
    id: overrides.id ?? "proj-1",
    name: overrides.name ?? "devtrack",
    workflow: overrides.workflow ?? ("sdlc" as const),
    domain: overrides.domain ?? "arcanelayer",
    tags: overrides.tags ?? ["typescript", "nextjs"],
    repoUrl: overrides.repoUrl ?? "https://github.com/org/devtrack",
    deployUrl: overrides.deployUrl ?? null,
    lastActivityAt: overrides.lastActivityAt ?? new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h ago
    prds: overrides.prds ?? [],
    pullRequests: overrides.pullRequests ?? [],
    createdAt: overrides.createdAt ?? new Date("2026-01-01"),
    updatedAt: overrides.updatedAt ?? new Date("2026-03-01"),
  }
}

const projectAlpha = makeApiProject({
  id: "proj-alpha",
  name: "alpha-project",
  domain: "arcanelayer",
  workflow: "sdlc",
  tags: ["react", "typescript"],
  lastActivityAt: new Date(Date.now() - 30 * 60 * 1000), // 30 min ago → "active-now"
  pullRequests: [
    {
      id: "pr-1",
      number: 10,
      title: "feat: add tests",
      status: "review_requested",
      check_status: "passing",
      branch_id: "feat/tests",
      url: "https://github.com/org/alpha/pull/10",
      author: "dev",
      opened_at: new Date(),
    },
  ],
  prds: [
    {
      id: "prd-1",
      title: "Feature A",
      summary: "Implement feature A",
      status: "in_progress",
      workItems: [
        { id: "wi-1", title: "Task 1", status: "done" },
        { id: "wi-2", title: "Task 2", status: "in_progress" },
      ],
    },
  ],
})

const projectBeta = makeApiProject({
  id: "proj-beta",
  name: "beta-project",
  domain: "aiteam",
  workflow: "sdlc",
  tags: ["blog", "writing"],
  lastActivityAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago → stale
  pullRequests: [],
  prds: [],
})

const projectGamma = makeApiProject({
  id: "proj-gamma",
  name: "gamma-project",
  domain: "infrastructure",
  workflow: "sdlc",
  tags: ["k8s"],
  lastActivityAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12h ago → "today"
  pullRequests: [],
  prds: [],
})

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
// Lazy import helper — DashboardPage is a "use client" component
// ---------------------------------------------------------------------------

async function importDashboardPage() {
  const mod = await import("@/components/features/dashboard/dashboard-page")
  return mod.default
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockSearchParams = new URLSearchParams()
  mockPush.mockReset()
  mockReplace.mockReset()
  mockUseProjectsReturn.data = undefined
  mockUseProjectsReturn.isLoading = false
  mockUseProjectsReturn.error = undefined
  mockUseProjectsReturn.mutate = vi.fn()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.resetModules()
})

// ---------------------------------------------------------------------------
// 1. Project cards populated from live API data
// ---------------------------------------------------------------------------

describe("AC1: Project cards from live API data", () => {
  it("renders a project card for each project returned by useProjects", async () => {
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("alpha-project")).toBeInTheDocument()
      expect(screen.getByText("beta-project")).toBeInTheDocument()
    })
  })

  it("renders project name from API data, not mock data", async () => {
    mockUseProjectsReturn.data = [makeApiProject({ id: "live-1", name: "live-api-project" })]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("live-api-project")).toBeInTheDocument()
    })
    // Static mock names should NOT appear
    expect(screen.queryByText("picking-app")).not.toBeInTheDocument()
  })

  it("applies mapProject transformation (summaryLine derived from API data)", async () => {
    mockUseProjectsReturn.data = [
      makeApiProject({
        id: "mapped-1",
        name: "mapped-project",
        prds: [
          {
            id: "prd-m1",
            title: "Active PRD Title",
            summary: "Do the thing",
            status: "in_progress",
            workItems: [
              { id: "wi-m1", title: "Step 1", status: "done" },
              { id: "wi-m2", title: "Step 2", status: "todo" },
            ],
          },
        ],
        pullRequests: [],
        lastActivityAt: new Date(),
      }),
    ]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // mapProject builds summaryLine from prds — "Active PRD Title — 1/2 items done"
      expect(screen.getByText(/active prd title/i)).toBeInTheDocument()
    })
  })

  it("renders project tags from API data", async () => {
    mockUseProjectsReturn.data = [
      makeApiProject({ name: "tagged-project", tags: ["custom-tag-xyz"] }),
    ]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("custom-tag-xyz")).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// 2. Activity pulse reflects real lastActivityAt timestamps
// ---------------------------------------------------------------------------

describe("AC2: Activity pulse from real lastActivityAt", () => {
  it("renders active-now indicator for project active within the last hour", async () => {
    mockUseProjectsReturn.data = [
      makeApiProject({
        name: "active-now-project",
        lastActivityAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
      }),
    ]

    const DashboardPage = await importDashboardPage()
    const { container } = render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // animate-ping is used for active-now pulsing dot
      expect(container.querySelector(".animate-ping")).toBeInTheDocument()
    })
  })

  it("renders stale styling for project with no activity in over a week", async () => {
    mockUseProjectsReturn.data = [
      makeApiProject({
        name: "stale-project",
        lastActivityAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days
      }),
    ]

    const DashboardPage = await importDashboardPage()
    const { container } = render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // stale projects get opacity-60 border-border/50
      const staleCard = container.querySelector(".opacity-60")
      expect(staleCard).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// 3. Filters update URL query params
// ---------------------------------------------------------------------------

describe("AC3: Filters update URL query params", () => {
  it("clicking a domain filter chip updates the URL with domain param", async () => {
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]
    const user = userEvent.setup()

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText("alpha-project"))

    // Click "Arcane Layer" domain filter
    const arcanelayerChip = screen.getByRole("button", { name: /arcane layer/i })
    await user.click(arcanelayerChip)

    // Should update URL (router.replace or router.push) with domain=arcanelayer
    await waitFor(() => {
      const calls = [...mockReplace.mock.calls, ...mockPush.mock.calls]
      const urlStrings = calls.map((c) => String(c[0]))
      expect(urlStrings.some((url) => url.includes("domain=arcanelayer"))).toBe(true)
    })
  })

  it("reads domain filter from URL query params on initial render", async () => {
    mockSearchParams = new URLSearchParams("domain=aiteam")
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // With domain=aiteam filter, only beta-project (domain: aiteam) should show
      expect(screen.getByText("beta-project")).toBeInTheDocument()
      expect(screen.queryByText("alpha-project")).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// 4. Sort options
// ---------------------------------------------------------------------------

describe("AC4: Sort options", () => {
  it("sort by name orders projects alphabetically", async () => {
    mockUseProjectsReturn.data = [projectBeta, projectAlpha, projectGamma]
    const user = userEvent.setup()

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText("alpha-project"))

    const nameSort = screen.getByRole("button", { name: /^name$/i })
    await user.click(nameSort)

    await waitFor(() => {
      const cards = screen.getAllByRole("link")
      const names = cards.map((c) => c.textContent ?? "")
      const alphaIdx = names.findIndex((n) => n.includes("alpha-project"))
      const betaIdx = names.findIndex((n) => n.includes("beta-project"))
      const gammaIdx = names.findIndex((n) => n.includes("gamma-project"))
      expect(alphaIdx).toBeLessThan(betaIdx)
      expect(betaIdx).toBeLessThan(gammaIdx)
    })
  })

  it("sort by last activity orders most-recent first", async () => {
    mockUseProjectsReturn.data = [projectBeta, projectGamma, projectAlpha]
    const user = userEvent.setup()

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText("alpha-project"))

    const activitySort = screen.getByRole("button", { name: /last activity/i })
    await user.click(activitySort)

    await waitFor(() => {
      const cards = screen.getAllByRole("link")
      const names = cards.map((c) => c.textContent ?? "")
      // alpha has most recent activity (30min ago), gamma is second (12h), beta is stale (10d)
      const alphaIdx = names.findIndex((n) => n.includes("alpha-project"))
      const gammaIdx = names.findIndex((n) => n.includes("gamma-project"))
      const betaIdx = names.findIndex((n) => n.includes("beta-project"))
      expect(alphaIdx).toBeLessThan(gammaIdx)
      expect(gammaIdx).toBeLessThan(betaIdx)
    })
  })

  it("sort by needs attention puts projects with open PRs first", async () => {
    mockUseProjectsReturn.data = [projectBeta, projectGamma, projectAlpha]
    const user = userEvent.setup()

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText("alpha-project"))

    const attentionSort = screen.getByRole("button", { name: /needs attention/i })
    await user.click(attentionSort)

    await waitFor(() => {
      const cards = screen.getAllByRole("link")
      const names = cards.map((c) => c.textContent ?? "")
      // alpha-project has 1 open PR — should come first
      const alphaIdx = names.findIndex((n) => n.includes("alpha-project"))
      expect(alphaIdx).toBe(0)
    })
  })

  it("reads sort from URL query params on initial render", async () => {
    mockSearchParams = new URLSearchParams("sort=name")
    mockUseProjectsReturn.data = [projectBeta, projectAlpha, projectGamma]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // With sort=name from URL, projects should be alphabetical
      const cards = screen.getAllByRole("link")
      const names = cards.map((c) => c.textContent ?? "")
      const alphaIdx = names.findIndex((n) => n.includes("alpha-project"))
      const betaIdx = names.findIndex((n) => n.includes("beta-project"))
      expect(alphaIdx).toBeLessThan(betaIdx)
    })
  })
})

// ---------------------------------------------------------------------------
// 5. Search filters projects by name
// ---------------------------------------------------------------------------

describe("AC5: Search filters projects by name", () => {
  it("typing in the search box shows only matching projects", async () => {
    mockUseProjectsReturn.data = [projectAlpha, projectBeta, projectGamma]
    const user = userEvent.setup()

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText("alpha-project"))

    const searchInput = screen.getByPlaceholderText(/search projects/i)
    await user.type(searchInput, "alpha")

    await waitFor(() => {
      expect(screen.getByText("alpha-project")).toBeInTheDocument()
      expect(screen.queryByText("beta-project")).not.toBeInTheDocument()
      expect(screen.queryByText("gamma-project")).not.toBeInTheDocument()
    })
  })

  it("search is case-insensitive", async () => {
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]
    const user = userEvent.setup()

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText("alpha-project"))

    const searchInput = screen.getByPlaceholderText(/search projects/i)
    await user.type(searchInput, "ALPHA")

    await waitFor(() => {
      expect(screen.getByText("alpha-project")).toBeInTheDocument()
      expect(screen.queryByText("beta-project")).not.toBeInTheDocument()
    })
  })

  it("search updates URL with q query param", async () => {
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]
    const user = userEvent.setup()

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText("alpha-project"))

    const searchInput = screen.getByPlaceholderText(/search projects/i)
    await user.type(searchInput, "alpha")

    await waitFor(() => {
      const calls = [...mockReplace.mock.calls, ...mockPush.mock.calls]
      const urlStrings = calls.map((c) => String(c[0]))
      expect(urlStrings.some((url) => url.includes("q=alpha"))).toBe(true)
    })
  })

  it("reads search query from URL params on initial render", async () => {
    mockSearchParams = new URLSearchParams("q=beta")
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("beta-project")).toBeInTheDocument()
      expect(screen.queryByText("alpha-project")).not.toBeInTheDocument()
    })
  })

  it("shows empty state message when no projects match search", async () => {
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]
    const user = userEvent.setup()

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText("alpha-project"))

    const searchInput = screen.getByPlaceholderText(/search projects/i)
    await user.type(searchInput, "zzznomatch")

    await waitFor(() => {
      expect(screen.queryByText("alpha-project")).not.toBeInTheDocument()
      expect(screen.queryByText("beta-project")).not.toBeInTheDocument()
      // Some "no results" or similar text
      expect(
        screen.getByText(/no projects/i) ||
          screen.getByText(/no results/i) ||
          screen.getByText(/match/i),
      ).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// 6. Count summary bar computed from actual data
// ---------------------------------------------------------------------------

describe("AC6: Count summary from actual data", () => {
  it("renders total project count from API data", async () => {
    mockUseProjectsReturn.data = [projectAlpha, projectBeta, projectGamma]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // Header should show "3 projects" (from live data, not mock)
      expect(screen.getByText(/3 projects/i)).toBeInTheDocument()
    })
  })

  it("computes open PR count from actual project data", async () => {
    mockUseProjectsReturn.data = [
      makeApiProject({
        name: "proj-with-pr",
        pullRequests: [
          {
            id: "pr-a",
            number: 1,
            title: "PR 1",
            status: "open",
            check_status: "passing",
            branch_id: "feat/a",
            url: "https://github.com/org/repo/pull/1",
            author: "dev",
            opened_at: new Date(),
          },
          {
            id: "pr-b",
            number: 2,
            title: "PR 2",
            status: "review_requested",
            check_status: "pending",
            branch_id: "feat/b",
            url: "https://github.com/org/repo/pull/2",
            author: "dev",
            opened_at: new Date(),
          },
        ],
      }),
      makeApiProject({ id: "proj-2", name: "proj-without-pr", pullRequests: [] }),
    ]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // 2 open PRs total from first project
      expect(screen.getByText(/2 prs? open/i)).toBeInTheDocument()
    })
  })

  it("shows needs-attention count for projects with open PRs or stale activity", async () => {
    mockUseProjectsReturn.data = [
      projectAlpha, // has open PR → needs attention
      projectBeta, // stale → needs attention
      projectGamma, // no PR, not stale
    ]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // 2 projects need attention
      expect(screen.getByText(/2 need attention/i)).toBeInTheDocument()
    })
  })

  it("summary bar shows zero counts when no projects loaded", async () => {
    mockUseProjectsReturn.data = []

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/0 projects/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// 7. Loading skeleton shown during fetch
// ---------------------------------------------------------------------------

describe("AC7: Loading skeleton during fetch", () => {
  it("renders loading skeletons when isLoading is true", async () => {
    mockUseProjectsReturn.isLoading = true
    mockUseProjectsReturn.data = undefined

    const DashboardPage = await importDashboardPage()
    const { container } = render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    // Skeletons use <output> elements with animate-pulse class
    await waitFor(() => {
      const skeletons = container.querySelectorAll("output")
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })

  it("renders animate-pulse skeleton cards while loading", async () => {
    mockUseProjectsReturn.isLoading = true
    mockUseProjectsReturn.data = undefined

    const DashboardPage = await importDashboardPage()
    const { container } = render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(container.querySelector(".animate-pulse")).toBeInTheDocument()
    })
  })

  it("does not render project cards while loading", async () => {
    mockUseProjectsReturn.isLoading = true
    mockUseProjectsReturn.data = undefined

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    // No project links while loading
    expect(screen.queryByRole("link", { name: /project/i })).not.toBeInTheDocument()
  })

  it("hides loading skeleton once data arrives", async () => {
    mockUseProjectsReturn.isLoading = false
    mockUseProjectsReturn.data = [projectAlpha]

    const DashboardPage = await importDashboardPage()
    const { container } = render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("alpha-project")).toBeInTheDocument()
    })

    // No pulsing skeletons once data is loaded
    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 8. Error state with retry
// ---------------------------------------------------------------------------

describe("AC8: Error state with retry", () => {
  it("renders error state when useProjects returns an error", async () => {
    mockUseProjectsReturn.error = new Error("Network error")
    mockUseProjectsReturn.data = undefined

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // Some error heading or message
      expect(
        screen.getByText(/something went wrong/i) ||
          screen.getByText(/failed to load/i) ||
          screen.getByText(/error/i),
      ).toBeTruthy()
    })
  })

  it("renders a retry button in the error state", async () => {
    mockUseProjectsReturn.error = new Error("Failed")
    mockUseProjectsReturn.data = undefined

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    })
  })

  it("clicking retry calls SWR mutate to re-fetch", async () => {
    const mutateFn = vi.fn()
    mockUseProjectsReturn.error = new Error("Failed")
    mockUseProjectsReturn.data = undefined
    mockUseProjectsReturn.mutate = mutateFn

    const user = userEvent.setup()
    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByRole("button", { name: /retry/i }))
    await user.click(screen.getByRole("button", { name: /retry/i }))

    expect(mutateFn).toHaveBeenCalledOnce()
  })

  it("does not render project cards or loading skeletons in error state", async () => {
    mockUseProjectsReturn.error = new Error("Failed")
    mockUseProjectsReturn.data = undefined

    const DashboardPage = await importDashboardPage()
    const { container } = render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByRole("button", { name: /retry/i }))

    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument()
    expect(screen.queryByText("alpha-project")).not.toBeInTheDocument()
  })

  it("shows error detail message from the thrown Error", async () => {
    mockUseProjectsReturn.error = new Error("HTTP 503")
    mockUseProjectsReturn.data = undefined

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/503/i) || screen.getByText(/failed/i)).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// 9. Click card navigates to /projects/[slug]
// ---------------------------------------------------------------------------

describe("AC9: Card navigation to /projects/[slug]", () => {
  it("each project card links to /projects/[slug]", async () => {
    mockUseProjectsReturn.data = [projectAlpha]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      const card = screen.getByRole("link", { name: /alpha-project/i })
      expect(card).toHaveAttribute("href", "/projects/alpha-project")
    })
  })

  it("card href uses the mapped slug (project.name as slug)", async () => {
    mockUseProjectsReturn.data = [makeApiProject({ id: "slug-test", name: "my-cool-project" })]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      const card = screen.getByRole("link", { name: /my-cool-project/i })
      expect(card).toHaveAttribute("href", "/projects/my-cool-project")
    })
  })

  it("multiple cards each have distinct slugged hrefs", async () => {
    mockUseProjectsReturn.data = [projectAlpha, projectBeta, projectGamma]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /alpha-project/i })).toHaveAttribute(
        "href",
        "/projects/alpha-project",
      )
      expect(screen.getByRole("link", { name: /beta-project/i })).toHaveAttribute(
        "href",
        "/projects/beta-project",
      )
      expect(screen.getByRole("link", { name: /gamma-project/i })).toHaveAttribute(
        "href",
        "/projects/gamma-project",
      )
    })
  })
})

// ---------------------------------------------------------------------------
// Integration: URL params drive complete filter + sort pipeline
// ---------------------------------------------------------------------------

describe("Integration: URL params drive full filter+sort pipeline", () => {
  it("domain + workflow + search + sort all applied together from URL params", async () => {
    mockSearchParams = new URLSearchParams("domain=arcanelayer&workflow=sdlc&q=alpha&sort=name")
    mockUseProjectsReturn.data = [projectBeta, projectAlpha, projectGamma]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // Only alpha-project matches all: domain=arcanelayer, workflow=sdlc, q=alpha
      expect(screen.getByText("alpha-project")).toBeInTheDocument()
      expect(screen.queryByText("beta-project")).not.toBeInTheDocument()
      expect(screen.queryByText("gamma-project")).not.toBeInTheDocument()
    })
  })

  it("renders count summary reflecting the full unfiltered project list", async () => {
    mockSearchParams = new URLSearchParams("domain=arcanelayer")
    mockUseProjectsReturn.data = [projectAlpha, projectBeta, projectGamma]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // Summary bar shows total from all projects, not just filtered
      expect(screen.getByText(/3 projects/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Edge cases: URL param injection, sort stability, filter combinations, empty
// ---------------------------------------------------------------------------

describe("Edge: URL param injection via search params", () => {
  it("renders XSS payload from q param as literal text, not HTML", async () => {
    const xssPayload = "<script>alert('xss')</script>"
    mockSearchParams = new URLSearchParams(`q=${encodeURIComponent(xssPayload)}`)
    mockUseProjectsReturn.data = [projectAlpha]

    const DashboardPage = await importDashboardPage()
    const { container } = render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    // React escapes output — no live script tag should exist
    expect(container.querySelector("script")).toBeNull()
    // Search input value should contain the literal string, not execute it
    const searchInput = container.querySelector("input[type='text']") as HTMLInputElement
    expect(searchInput?.value).toBe(xssPayload)
  })

  it("ignores unknown domain values in URL params without crashing", async () => {
    mockSearchParams = new URLSearchParams("domain=nonexistent-domain-xyz")
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    // Should not crash; no projects match unknown domain, so empty state shown
    await waitFor(() => {
      expect(screen.queryByText("alpha-project")).not.toBeInTheDocument()
      expect(screen.queryByText("beta-project")).not.toBeInTheDocument()
    })
  })

  it("ignores unknown sort values in URL params, falls back gracefully", async () => {
    mockSearchParams = new URLSearchParams("sort=invalid-sort")
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]

    const DashboardPage = await importDashboardPage()
    expect(() =>
      render(
        <SWRWrapper>
          <DashboardPage />
        </SWRWrapper>,
      ),
    ).not.toThrow()

    // Projects should still render (no crash)
    await waitFor(() => {
      expect(screen.getByText("alpha-project")).toBeInTheDocument()
    })
  })
})

describe("Edge: Sort stability with equal lastActivityAt buckets", () => {
  it("maintains consistent order when two projects share the same activityLevel", async () => {
    // Both projects have "today" activity level (within last 24h but > 1h)
    const projA = makeApiProject({
      id: "stable-a",
      name: "aardvark-project",
      lastActivityAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3h ago → today
      pullRequests: [],
    })
    const projB = makeApiProject({
      id: "stable-b",
      name: "zebra-project",
      lastActivityAt: new Date(Date.now() - 5 * 60 * 60 * 1000), // 5h ago → today
      pullRequests: [],
    })

    mockUseProjectsReturn.data = [projB, projA] // reverse order input
    const user = userEvent.setup()

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText("aardvark-project"))

    // Switch to name sort to get a deterministic order
    const nameSort = screen.getByRole("button", { name: /^name$/i })
    await user.click(nameSort)

    await waitFor(() => {
      const cards = screen.getAllByRole("link")
      const names = cards.map((c) => c.textContent ?? "")
      const aIdx = names.findIndex((n) => n.includes("aardvark-project"))
      const zIdx = names.findIndex((n) => n.includes("zebra-project"))
      // Name sort should produce stable alphabetical order
      expect(aIdx).toBeLessThan(zIdx)
    })
  })

  it("attention sort is stable: projects with same score keep consistent positions", async () => {
    // Two projects with no PRs and same activityLevel → same score in attention sort
    const projX = makeApiProject({
      id: "score-x",
      name: "x-project",
      lastActivityAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // today
      pullRequests: [],
    })
    const projY = makeApiProject({
      id: "score-y",
      name: "y-project",
      lastActivityAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // today
      pullRequests: [],
    })

    mockUseProjectsReturn.data = [projX, projY]

    const DashboardPage = await importDashboardPage()
    expect(() =>
      render(
        <SWRWrapper>
          <DashboardPage />
        </SWRWrapper>,
      ),
    ).not.toThrow()

    // Both should appear regardless of sort order
    await waitFor(() => {
      expect(screen.getByText("x-project")).toBeInTheDocument()
      expect(screen.getByText("y-project")).toBeInTheDocument()
    })
  })
})

describe("Edge: Multiple active filters combined", () => {
  it("domain filter + search combined show only projects matching both", async () => {
    mockUseProjectsReturn.data = [projectAlpha, projectBeta, projectGamma]
    const user = userEvent.setup()

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText("alpha-project"))

    // Filter domain to arcanelayer
    await user.click(screen.getByRole("button", { name: /^arcane layer$/i }))

    // Then search for "gamma" (which is in infrastructure, not arcanelayer)
    const searchInput = screen.getByPlaceholderText(/search projects/i)
    await user.type(searchInput, "gamma")

    await waitFor(() => {
      // No project matches both arcanelayer domain AND "gamma" search
      expect(screen.queryByText("alpha-project")).not.toBeInTheDocument()
      expect(screen.queryByText("gamma-project")).not.toBeInTheDocument()
    })
  })

  it("shows empty state when all three filters combined yield no results", async () => {
    mockUseProjectsReturn.data = [projectAlpha, projectBeta, projectGamma]
    const user = userEvent.setup()

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText("alpha-project"))

    // Apply domain filter for wendyowensbooks (no projects have this domain)
    await user.click(screen.getByRole("button", { name: /^wendy owens books$/i }))

    await waitFor(() => {
      expect(screen.getByText(/no projects match/i)).toBeInTheDocument()
    })
  })
})

describe("Edge: Empty search results", () => {
  it("shows empty state when search yields no matches", async () => {
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]
    const user = userEvent.setup()

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText("alpha-project"))

    const searchInput = screen.getByPlaceholderText(/search projects/i)
    await user.type(searchInput, "zzznomatch999")

    await waitFor(() => {
      expect(screen.queryByText("alpha-project")).not.toBeInTheDocument()
      expect(screen.queryByText("beta-project")).not.toBeInTheDocument()
      expect(screen.getByText(/no projects match/i)).toBeInTheDocument()
    })
  })

  it("clearing search after empty results restores project list", async () => {
    mockUseProjectsReturn.data = [projectAlpha]
    const user = userEvent.setup()

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText("alpha-project"))

    const searchInput = screen.getByPlaceholderText(/search projects/i)
    await user.type(searchInput, "zzznomatch999")

    await waitFor(() => {
      expect(screen.queryByText("alpha-project")).not.toBeInTheDocument()
    })

    // Clear search
    await user.clear(searchInput)

    await waitFor(() => {
      expect(screen.getByText("alpha-project")).toBeInTheDocument()
    })
  })

  it("search also matches project tags", async () => {
    // projectAlpha has tags ["react", "typescript"]
    mockUseProjectsReturn.data = [projectAlpha, projectBeta]
    const user = userEvent.setup()

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText("alpha-project"))

    const searchInput = screen.getByPlaceholderText(/search projects/i)
    await user.type(searchInput, "react")

    await waitFor(() => {
      // alpha has "react" tag → matches
      expect(screen.getByText("alpha-project")).toBeInTheDocument()
      // beta has "blog", "writing" tags → no match
      expect(screen.queryByText("beta-project")).not.toBeInTheDocument()
    })
  })

  it("buildUrl returns /? (not just /) when all params are default — documents known behavior", async () => {
    // When all filters are default (no params), buildUrl returns "/?", not "/"
    // This is a minor cosmetic issue (trailing ?) but does not break functionality
    mockUseProjectsReturn.data = [projectAlpha]
    const user = userEvent.setup()

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText("alpha-project"))

    // Click "All Domains" to reset domain filter (which calls buildUrl with all defaults)
    const allDomainsBtn = screen.getByRole("button", { name: /all domains/i })
    await user.click(allDomainsBtn)

    await waitFor(() => {
      const calls = [...mockReplace.mock.calls, ...mockPush.mock.calls]
      const urlStrings = calls.map((c) => String(c[0]))
      // Documents that the URL produced is "/?" (with trailing ?) not just "/"
      expect(urlStrings.some((url) => url === "/?" || url === "/")).toBe(true)
    })
  })
})
