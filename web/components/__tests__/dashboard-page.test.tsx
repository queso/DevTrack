/**
 * Tests for WI-001: Wire dashboard home page to real API
 *
 * Acceptance criteria:
 * 1. Fetches projects via useProjects() — no static mock-data imports
 * 2. Shows skeleton grid while loading
 * 3. Shows error state with retry button on API failure
 * 4. Shows empty state when API returns no projects
 * 5. Filters and search work against live data
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}))

const mockMutate = vi.fn()
const mockUseProjectsReturn: {
  data: unknown[] | undefined
  isLoading: boolean
  error: Error | undefined
  mutate: () => void
} = {
  data: undefined,
  isLoading: false,
  error: undefined,
  mutate: mockMutate,
}

vi.mock("@/lib/hooks", () => ({
  useProjects: () => mockUseProjectsReturn,
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "proj-1",
    name: "test-project",
    workflow: "sdlc" as const,
    domain: "arcanelayer",
    tags: ["typescript"],
    repoUrl: null,
    deployUrl: null,
    lastActivityAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    prds: [],
    pullRequests: [],
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-03-01"),
    ...overrides,
  }
}

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

async function importDashboardPage() {
  const mod = await import("@/components/features/dashboard/dashboard-page")
  return mod.default
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockUseProjectsReturn.data = undefined
  mockUseProjectsReturn.isLoading = false
  mockUseProjectsReturn.error = undefined
  mockUseProjectsReturn.mutate = mockMutate
  vi.clearAllMocks()
})

afterEach(() => {
  vi.resetModules()
})

// ---------------------------------------------------------------------------
// AC1: Fetches from live API (useProjects), not mock data
// ---------------------------------------------------------------------------

describe("AC1: Uses real API via useProjects hook", () => {
  it("renders project cards from API data", async () => {
    mockUseProjectsReturn.data = [
      makeProject({ id: "live-1", name: "api-project-alpha" }),
      makeProject({ id: "live-2", name: "api-project-beta" }),
    ]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("api-project-alpha")).toBeInTheDocument()
      expect(screen.getByText("api-project-beta")).toBeInTheDocument()
    })
  })

  it("does not render static mock project names", async () => {
    mockUseProjectsReturn.data = [makeProject({ name: "only-live-project" })]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("only-live-project")).toBeInTheDocument()
    })

    // Known mock-data project names should never appear
    expect(screen.queryByText("picking-app")).not.toBeInTheDocument()
    expect(screen.queryByText("devtrack")).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// AC2: Loading skeleton
// ---------------------------------------------------------------------------

describe("AC2: Shows loading skeleton while fetching", () => {
  it("renders skeleton elements when isLoading is true", async () => {
    mockUseProjectsReturn.isLoading = true
    mockUseProjectsReturn.data = undefined

    const DashboardPage = await importDashboardPage()
    const { container } = render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    // Skeleton cards use animate-pulse
    const skeletons = container.querySelectorAll(".animate-pulse")
    expect(skeletons.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// AC3: Error state with retry
// ---------------------------------------------------------------------------

describe("AC3: Error state with retry button", () => {
  it("shows error message and retry button on API failure", async () => {
    mockUseProjectsReturn.error = new Error("Network error")
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

  it("calls mutate when retry button is clicked", async () => {
    mockUseProjectsReturn.error = new Error("Network error")
    mockUseProjectsReturn.data = undefined

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    const retryBtn = await screen.findByRole("button", { name: /retry/i })
    await userEvent.click(retryBtn)

    expect(mockMutate).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// AC4: Empty state when no projects
// ---------------------------------------------------------------------------

describe("AC4: Empty state when API returns no projects", () => {
  it("shows empty state message when projects array is empty", async () => {
    mockUseProjectsReturn.data = []

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // Should show some kind of empty/no-projects message
      expect(
        screen.getByText(/no projects/i) ||
          screen.getByText(/0 projects/i) ||
          screen.queryByRole("link") === null,
      ).toBeTruthy()
    })
  })
})

// ---------------------------------------------------------------------------
// AC5: Filters and search against live data
// ---------------------------------------------------------------------------

describe("AC5: Filters and search work on live data", () => {
  it("filters projects by domain chip", async () => {
    mockUseProjectsReturn.data = [
      makeProject({ id: "p1", name: "arcane-project", domain: "arcanelayer" }),
      makeProject({ id: "p2", name: "ateam-project", domain: "aiteam" }),
    ]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    // Both visible initially
    await waitFor(() => {
      expect(screen.getByText("arcane-project")).toBeInTheDocument()
      expect(screen.getByText("ateam-project")).toBeInTheDocument()
    })

    // Click Arcane Layer filter chip
    const arcaneChip = screen.getByRole("button", { name: /arcane layer/i })
    await userEvent.click(arcaneChip)

    await waitFor(() => {
      expect(screen.getByText("arcane-project")).toBeInTheDocument()
      expect(screen.queryByText("ateam-project")).not.toBeInTheDocument()
    })
  })

  it("filters projects by search query", async () => {
    mockUseProjectsReturn.data = [
      makeProject({ id: "s1", name: "searchable-project", tags: ["react"] }),
      makeProject({ id: "s2", name: "other-project", tags: ["vue"] }),
    ]

    const DashboardPage = await importDashboardPage()
    render(
      <SWRWrapper>
        <DashboardPage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("searchable-project")).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/search projects/i)
    await userEvent.type(searchInput, "searchable")

    await waitFor(() => {
      expect(screen.getByText("searchable-project")).toBeInTheDocument()
      expect(screen.queryByText("other-project")).not.toBeInTheDocument()
    })
  })
})
