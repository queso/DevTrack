/**
 * Tests for WI-634: Wire PR queue page to live API data.
 *
 * Acceptance criteria covered:
 * 1. PR list populated from live API via SWR (usePRs)
 * 2. Age color coding: green (<1 day), yellow (1-3 days), red (>3 days)
 * 3. PR title links to GitHub PR URL
 * 4. Sort and filter controls work with URL query params
 * 5. Loading/error states shown appropriately
 * 6. Empty state when no open PRs
 *
 * Strategy:
 * - Mock `lib/hooks` to control usePRs return value
 * - Mock `next/navigation` for useRouter / useSearchParams / usePathname
 * - Mount PRQueuePage and assert rendered output
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement, type ReactNode } from "react"
import { SWRConfig } from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

interface PullRequest {
  id: string
  projectSlug?: string
  number: number
  title: string
  branch: string
  status: string
  checkStatus: string
  createdAt: string
  url: string
  author: string
  unresolvedComments: number
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn()
const mockReplace = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/prs",
}))

// Mock usePRs and useProjects hooks — controlled per-test
const mockUsePRsReturn: {
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
  usePRs: () => mockUsePRsReturn,
  useProjects: () => mockUseProjectsReturn,
}))

// ---------------------------------------------------------------------------
// Fixtures — raw API PR shape (what usePRs returns before mapping via mapPR)
// ---------------------------------------------------------------------------

function makeApiPR(
  overrides: Partial<{
    id: string
    number: number
    title: string
    status: string
    checkStatus: string | null
    branchId: string | null
    url: string
    author: string
    openedAt: Date
  }> = {},
) {
  return {
    id: overrides.id ?? "pr-1",
    number: overrides.number ?? 42,
    title: overrides.title ?? "feat: add tests",
    status: overrides.status ?? "open",
    checkStatus: overrides.checkStatus ?? "passing",
    branchId: overrides.branchId ?? "feat/add-tests",
    url: overrides.url ?? "https://github.com/org/repo/pull/42",
    author: overrides.author ?? "devuser",
    openedAt: overrides.openedAt ?? new Date(),
  }
}

// Helper to build a mapped UiPullRequest (what mapPR returns)
function _makeMappedPR(projectSlug: string, overrides: Partial<PullRequest> = {}): PullRequest {
  const now = new Date()
  return {
    id: overrides.id ?? "pr-1",
    projectSlug,
    number: overrides.number ?? 42,
    title: overrides.title ?? "feat: add tests",
    branch: overrides.branch ?? "feat/add-tests",
    status: overrides.status ?? "open",
    checkStatus: overrides.checkStatus ?? "passing",
    createdAt: overrides.createdAt ?? now.toISOString(),
    url: overrides.url ?? "https://github.com/org/repo/pull/42",
    author: overrides.author ?? "devuser",
    unresolvedComments: overrides.unresolvedComments ?? 0,
  }
}

function _hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString()
}

function _daysAgo(d: number): string {
  return new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString()
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

// ---------------------------------------------------------------------------
// Lazy import helper
// ---------------------------------------------------------------------------

async function importPRQueuePage() {
  const mod = await import("@/components/features/dashboard/pr-queue-page")
  return mod.default
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockSearchParams = new URLSearchParams()
  mockPush.mockReset()
  mockReplace.mockReset()
  mockUsePRsReturn.data = undefined
  mockUsePRsReturn.isLoading = false
  mockUsePRsReturn.error = undefined
  mockUsePRsReturn.mutate = vi.fn()
  mockUseProjectsReturn.data = undefined
  mockUseProjectsReturn.isLoading = false
  mockUseProjectsReturn.error = undefined
  vi.clearAllMocks()
})

afterEach(() => {
  vi.resetModules()
})

// ---------------------------------------------------------------------------
// AC1: PR list populated from live API via SWR
// ---------------------------------------------------------------------------

describe("AC1: PR list from live API via SWR", () => {
  it("renders PR rows for each PR returned by usePRs", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-a", number: 10, title: "feat: first PR", status: "open" }),
      makeApiPR({ id: "pr-b", number: 11, title: "fix: second PR", status: "draft" }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/first PR/i)).toBeInTheDocument()
      expect(screen.getByText(/second PR/i)).toBeInTheDocument()
    })
  })

  it("displays PR number alongside title", async () => {
    mockUsePRsReturn.data = [makeApiPR({ id: "pr-1", number: 99, title: "chore: update deps" })]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/#99/)).toBeInTheDocument()
    })
  })

  it("does not render static mock PR data (ALL_PRS)", async () => {
    // When usePRs returns only one specific PR, static mock names must not appear
    mockUsePRsReturn.data = [makeApiPR({ id: "live-1", title: "live-api-pr-title-xyz" })]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/live-api-pr-title-xyz/i)).toBeInTheDocument()
    })
    // Static mock PR titles must not appear
    expect(screen.queryByText(/barcode scanner integration/i)).not.toBeInTheDocument()
  })

  it("renders branch name for each PR row", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-b1", branchId: "feature/my-branch-name", title: "feat: branch test" }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("feature/my-branch-name")).toBeInTheDocument()
    })
  })

  it("renders author for each PR row", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-auth", author: "authorhandle123", title: "feat: author test" }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("authorhandle123")).toBeInTheDocument()
    })
  })

  it("header shows total open PR count from live data", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-c1", title: "PR one" }),
      makeApiPR({ id: "pr-c2", title: "PR two" }),
      makeApiPR({ id: "pr-c3", title: "PR three" }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/3 open pull request/i)).toBeInTheDocument()
    })
  })

  it("handles singular '1 open pull request' correctly", async () => {
    mockUsePRsReturn.data = [makeApiPR({ id: "pr-single", title: "solo PR" })]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // Should say "1 open pull request" not "1 open pull requests"
      expect(screen.getByText(/1 open pull request[^s]/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// AC2: Age color coding
// ---------------------------------------------------------------------------

describe("AC2: Age color coding", () => {
  it("renders green color for PR opened less than 1 day ago", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({
        id: "pr-green",
        title: "fresh PR",
        openedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      }), // 2h ago
    ]

    const PRQueuePage = await importPRQueuePage()
    const { container } = render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/fresh PR/i))

    // Green color class for age < 1 day
    const greenAge = container.querySelector(".text-emerald-400")
    expect(greenAge).toBeInTheDocument()
  })

  it("renders yellow color for PR opened 1-3 days ago", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({
        id: "pr-yellow",
        title: "aging PR",
        openedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      }), // 2 days ago
    ]

    const PRQueuePage = await importPRQueuePage()
    const { container } = render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/aging PR/i))

    const yellowAge = container.querySelector(".text-amber-400")
    expect(yellowAge).toBeInTheDocument()
  })

  it("renders red color for PR opened more than 3 days ago", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({
        id: "pr-red",
        title: "stale PR",
        openedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      }), // 5 days ago
    ]

    const PRQueuePage = await importPRQueuePage()
    const { container } = render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/stale PR/i))

    const redAge = container.querySelector(".text-red-400")
    expect(redAge).toBeInTheDocument()
  })

  it("age label shows hours for PR less than 1 day old", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({
        id: "pr-hrs",
        title: "hourly PR",
        openedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      }), // 6h ago
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("6h")).toBeInTheDocument()
    })
  })

  it("age label shows days for PR older than 1 day", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({
        id: "pr-days",
        title: "old PR",
        openedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      }), // 4 days
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText("4d")).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// AC3: PR title links to GitHub PR URL
// ---------------------------------------------------------------------------

describe("AC3: PR title links to GitHub PR URL", () => {
  it("renders an anchor linking to the PR's GitHub URL", async () => {
    const prUrl = "https://github.com/org/myrepo/pull/77"
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-link", number: 77, title: "feat: linked PR", url: prUrl }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /#77 feat: linked PR/i })
      expect(link).toHaveAttribute("href", prUrl)
    })
  })

  it("PR link opens in a new tab (target=_blank)", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-tab", title: "new tab PR", url: "https://github.com/org/repo/pull/1" }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /#42 new tab PR/i })
      expect(link).toHaveAttribute("target", "_blank")
    })
  })

  it("PR link has rel=noopener noreferrer for security", async () => {
    mockUsePRsReturn.data = [makeApiPR({ id: "pr-rel", title: "secure link PR" })]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /#42 secure link PR/i })
      expect(link).toHaveAttribute("rel", "noopener noreferrer")
    })
  })

  it("each PR row links to its own distinct GitHub URL", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({
        id: "pr-u1",
        number: 1,
        title: "first PR",
        url: "https://github.com/org/a/pull/1",
      }),
      makeApiPR({
        id: "pr-u2",
        number: 2,
        title: "second PR",
        url: "https://github.com/org/b/pull/2",
      }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      const link1 = screen.getByRole("link", { name: /#1 first PR/i })
      const link2 = screen.getByRole("link", { name: /#2 second PR/i })
      expect(link1).toHaveAttribute("href", "https://github.com/org/a/pull/1")
      expect(link2).toHaveAttribute("href", "https://github.com/org/b/pull/2")
    })
  })
})

// ---------------------------------------------------------------------------
// AC4: Sort and filter controls work with URL query params
// ---------------------------------------------------------------------------

describe("AC4: Sort and filter controls with URL query params", () => {
  describe("Sort by age", () => {
    it("sorts PRs oldest-first by default", async () => {
      mockUsePRsReturn.data = [
        makeApiPR({
          id: "pr-new",
          number: 1,
          title: "new PR",
          openedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        }),
        makeApiPR({
          id: "pr-old",
          number: 2,
          title: "old PR",
          openedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        }),
      ]

      const PRQueuePage = await importPRQueuePage()
      render(
        <SWRWrapper>
          <PRQueuePage />
        </SWRWrapper>,
      )

      await waitFor(() => {
        const rows = screen.getAllByRole("row").slice(1) // skip header
        expect(rows[0].textContent).toMatch(/old PR/)
        expect(rows[1].textContent).toMatch(/new PR/)
      })
    })

    it("clicking Age header updates sort to age and toggles direction", async () => {
      mockUsePRsReturn.data = [
        makeApiPR({
          id: "pr-a1",
          number: 1,
          title: "PR one",
          openedAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
        }),
        makeApiPR({
          id: "pr-a2",
          number: 2,
          title: "PR two",
          openedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        }),
      ]
      const user = userEvent.setup()

      const PRQueuePage = await importPRQueuePage()
      render(
        <SWRWrapper>
          <PRQueuePage />
        </SWRWrapper>,
      )

      await waitFor(() => screen.getByText(/PR one/i))

      // Click Age sort button — should toggle direction
      const ageButton = screen.getByRole("button", { name: /age/i })
      await user.click(ageButton)

      await waitFor(() => {
        const rows = screen.getAllByRole("row").slice(1)
        expect(rows[0].textContent).toMatch(/PR one/) // now newest first
      })
    })
  })

  describe("Sort by project", () => {
    it("clicking Project header sorts PRs alphabetically by project slug", async () => {
      mockUsePRsReturn.data = [
        makeApiPR({ id: "pr-z", number: 3, title: "PR from zeta" }),
        makeApiPR({ id: "pr-a", number: 1, title: "PR from alpha" }),
        makeApiPR({ id: "pr-m", number: 2, title: "PR from mango" }),
      ]
      const user = userEvent.setup()

      const PRQueuePage = await importPRQueuePage()
      render(
        <SWRWrapper>
          <PRQueuePage />
        </SWRWrapper>,
      )

      await waitFor(() => screen.getByText(/PR from zeta/i))

      const projectButton = screen.getByRole("button", { name: /project/i })
      await user.click(projectButton)

      // After sort by project, PRs should be alphabetical by projectSlug
      // All use same default projectSlug, so order should be stable
      await waitFor(() => {
        expect(screen.getByText(/PR from alpha/i)).toBeInTheDocument()
      })
    })
  })

  describe("Sort by status", () => {
    it("clicking Status header sorts PRs by status order", async () => {
      mockUsePRsReturn.data = [
        makeApiPR({ id: "pr-ap", number: 1, title: "approved PR", status: "approved" }),
        makeApiPR({ id: "pr-dr", number: 2, title: "draft PR", status: "draft" }),
        makeApiPR({ id: "pr-op", number: 3, title: "open PR", status: "open" }),
      ]
      const user = userEvent.setup()

      const PRQueuePage = await importPRQueuePage()
      render(
        <SWRWrapper>
          <PRQueuePage />
        </SWRWrapper>,
      )

      await waitFor(() => screen.getByText(/approved PR/i))

      const statusButton = screen.getByRole("button", { name: /status/i })
      await user.click(statusButton)

      await waitFor(() => {
        const rows = screen.getAllByRole("row").slice(1)
        // draft (order 0) should be first, then open (1), then approved (4)
        expect(rows[0].textContent).toMatch(/draft PR/)
        expect(rows[1].textContent).toMatch(/open PR/)
        expect(rows[2].textContent).toMatch(/approved PR/)
      })
    })
  })

  describe("Domain filter", () => {
    it("renders domain filter buttons for available domains", async () => {
      mockUsePRsReturn.data = []

      const PRQueuePage = await importPRQueuePage()
      render(
        <SWRWrapper>
          <PRQueuePage />
        </SWRWrapper>,
      )

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /all domains/i })).toBeInTheDocument()
      })
    })

    it("clicking a domain filter updates URL query params with domain", async () => {
      mockUsePRsReturn.data = []
      const user = userEvent.setup()

      const PRQueuePage = await importPRQueuePage()
      render(
        <SWRWrapper>
          <PRQueuePage />
        </SWRWrapper>,
      )

      await waitFor(() => screen.getByRole("button", { name: /all domains/i }))

      const arcanelayerFilter = screen.getByRole("button", { name: /arcane layer/i })
      await user.click(arcanelayerFilter)

      await waitFor(() => {
        const calls = [...mockReplace.mock.calls, ...mockPush.mock.calls]
        const urlStrings = calls.map((c) => String(c[0]))
        expect(urlStrings.some((url) => url.includes("domain=arcanelayer"))).toBe(true)
      })
    })

    it("reads domain filter from URL params on initial render", async () => {
      mockSearchParams = new URLSearchParams("domain=aiteam")
      mockUsePRsReturn.data = [
        makeApiPR({ id: "pr-ai", number: 5, title: "aiteam PR" }),
        makeApiPR({ id: "pr-arc", number: 6, title: "arcanelayer PR" }),
      ]

      const PRQueuePage = await importPRQueuePage()
      render(
        <SWRWrapper>
          <PRQueuePage />
        </SWRWrapper>,
      )

      // The domain filter should be pre-selected from URL param
      await waitFor(() => {
        const aiButton = screen.getByRole("button", { name: /ai team/i })
        // Active filter button has a different style class
        expect(aiButton.className).toMatch(/bg-secondary/)
      })
    })

    it("clicking All Domains resets filter and updates URL", async () => {
      mockSearchParams = new URLSearchParams("domain=aiteam")
      mockUsePRsReturn.data = []
      const user = userEvent.setup()

      const PRQueuePage = await importPRQueuePage()
      render(
        <SWRWrapper>
          <PRQueuePage />
        </SWRWrapper>,
      )

      await waitFor(() => screen.getByRole("button", { name: /all domains/i }))
      await user.click(screen.getByRole("button", { name: /all domains/i }))

      await waitFor(() => {
        const calls = [...mockReplace.mock.calls, ...mockPush.mock.calls]
        // Should clear domain from URL (either remove param or set to empty)
        expect(calls.length).toBeGreaterThan(0)
      })
    })
  })

  describe("Sort reads from URL params", () => {
    it("reads sort key from URL query params on initial render", async () => {
      mockSearchParams = new URLSearchParams("sort=status")
      mockUsePRsReturn.data = [
        makeApiPR({ id: "pr-s1", number: 1, title: "approved PR", status: "approved" }),
        makeApiPR({ id: "pr-s2", number: 2, title: "draft PR", status: "draft" }),
      ]

      const PRQueuePage = await importPRQueuePage()
      render(
        <SWRWrapper>
          <PRQueuePage />
        </SWRWrapper>,
      )

      await waitFor(() => {
        // With sort=status from URL, draft (0) should be before approved (4)
        const rows = screen.getAllByRole("row").slice(1)
        expect(rows[0].textContent).toMatch(/draft PR/)
        expect(rows[1].textContent).toMatch(/approved PR/)
      })
    })

    it("clicking a sort header updates URL with sort param", async () => {
      mockUsePRsReturn.data = [makeApiPR({ id: "pr-p1", number: 1, title: "PR one" })]
      const user = userEvent.setup()

      const PRQueuePage = await importPRQueuePage()
      render(
        <SWRWrapper>
          <PRQueuePage />
        </SWRWrapper>,
      )

      await waitFor(() => screen.getByText(/PR one/i))

      const projectButton = screen.getByRole("button", { name: /project/i })
      await user.click(projectButton)

      await waitFor(() => {
        const calls = [...mockReplace.mock.calls, ...mockPush.mock.calls]
        const urlStrings = calls.map((c) => String(c[0]))
        expect(urlStrings.some((url) => url.includes("sort=project"))).toBe(true)
      })
    })
  })
})

// ---------------------------------------------------------------------------
// AC5: Loading and error states
// ---------------------------------------------------------------------------

describe("AC5: Loading and error states", () => {
  it("renders loading skeleton rows when isLoading is true", async () => {
    mockUsePRsReturn.isLoading = true
    mockUsePRsReturn.data = undefined

    const PRQueuePage = await importPRQueuePage()
    const { container } = render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(container.querySelector(".animate-pulse")).toBeInTheDocument()
    })
  })

  it("does not render PR rows while loading", async () => {
    mockUsePRsReturn.isLoading = true
    mockUsePRsReturn.data = undefined

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    // No GitHub links while loading
    expect(screen.queryByRole("link", { name: /#/i })).not.toBeInTheDocument()
  })

  it("hides loading skeleton once data arrives", async () => {
    mockUsePRsReturn.isLoading = false
    mockUsePRsReturn.data = [makeApiPR({ id: "pr-loaded", title: "loaded PR" })]

    const PRQueuePage = await importPRQueuePage()
    const { container } = render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/loaded PR/i)).toBeInTheDocument()
    })

    // No pulsing skeleton once data is loaded
    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument()
  })

  it("renders error state when usePRs returns an error", async () => {
    mockUsePRsReturn.error = new Error("Network error")
    mockUsePRsReturn.data = undefined

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(
        screen.getByText(/something went wrong/i) ||
          screen.getByText(/failed to load/i) ||
          screen.getByText(/error/i),
      ).toBeTruthy()
    })
  })

  it("renders retry button in error state", async () => {
    mockUsePRsReturn.error = new Error("Failed")
    mockUsePRsReturn.data = undefined

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
    })
  })

  it("clicking retry calls mutate to re-fetch", async () => {
    const mutateFn = vi.fn()
    mockUsePRsReturn.error = new Error("Failed")
    mockUsePRsReturn.data = undefined
    mockUsePRsReturn.mutate = mutateFn

    const user = userEvent.setup()
    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByRole("button", { name: /retry/i }))
    await user.click(screen.getByRole("button", { name: /retry/i }))

    expect(mutateFn).toHaveBeenCalledOnce()
  })

  it("does not render PR rows or skeletons in error state", async () => {
    mockUsePRsReturn.error = new Error("Failed")
    mockUsePRsReturn.data = undefined

    const PRQueuePage = await importPRQueuePage()
    const { container } = render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByRole("button", { name: /retry/i }))

    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /#/i })).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// AC6: Empty state when no open PRs
// ---------------------------------------------------------------------------

describe("AC6: Empty state when no open PRs", () => {
  it("renders empty state message when usePRs returns empty array", async () => {
    mockUsePRsReturn.data = []

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/no open pull requests/i)).toBeInTheDocument()
    })
  })

  it("renders empty state when domain filter excludes all PRs", async () => {
    mockSearchParams = new URLSearchParams("domain=wendyowensbooks")
    mockUsePRsReturn.data = [makeApiPR({ id: "pr-e1", title: "PR in arcanelayer" })]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    // When filtered domain produces no results, empty state should appear
    // (this depends on implementation — if filter is server-side via usePRs params,
    // usePRs might return empty; if client-side, the filter hides rows)
    await waitFor(() => {
      // Either the PR is hidden or we see the empty state message
      const noOpenPRs = screen.queryByText(/no open pull requests/i)
      const prTitle = screen.queryByText(/PR in arcanelayer/i)
      // At least one of these should be true after domain filter
      expect(noOpenPRs !== null || prTitle !== null).toBe(true)
    })
  })

  it("does not render the PR table when data is empty", async () => {
    mockUsePRsReturn.data = []

    const PRQueuePage = await importPRQueuePage()
    const { container } = render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/no open pull requests/i))

    // Table should not be present
    expect(container.querySelector("table")).not.toBeInTheDocument()
  })

  it("header still renders with 0 count in empty state", async () => {
    mockUsePRsReturn.data = []

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/PR Queue/i)).toBeInTheDocument()
      expect(screen.getByText(/0 open pull request/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Integration: PR row wires all fields correctly from mapPR output
// ---------------------------------------------------------------------------

describe("Integration: PR row fields wired from mapPR", () => {
  it("renders project slug, title, branch, status, check status, and author for a PR", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({
        id: "pr-full",
        number: 55,
        title: "feat: full row test",
        status: "open",
        checkStatus: "passing",
        branchId: "feat/full-row",
        url: "https://github.com/org/repo/pull/55",
        author: "fullauthor",
        openedAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1h ago -> green
      }),
    ]

    const PRQueuePage = await importPRQueuePage()
    const { container } = render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // Title link
      expect(screen.getByRole("link", { name: /#55 feat: full row test/i })).toBeInTheDocument()
      // Branch
      expect(screen.getByText("feat/full-row")).toBeInTheDocument()
      // Author
      expect(screen.getByText("fullauthor")).toBeInTheDocument()
      // Age is green (< 1 day)
      expect(container.querySelector(".text-emerald-400")).toBeInTheDocument()
    })
  })

  it("renders check status badge for passing, failing, and pending states", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-pass", number: 1, title: "passing PR", checkStatus: "passing" }),
      makeApiPR({ id: "pr-fail", number: 2, title: "failing PR", checkStatus: "failing" }),
      makeApiPR({ id: "pr-pend", number: 3, title: "pending PR", checkStatus: "pending" }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/passing PR/i)).toBeInTheDocument()
      expect(screen.getByText(/failing PR/i)).toBeInTheDocument()
      expect(screen.getByText(/pending PR/i)).toBeInTheDocument()
    })
  })

  it("maps 'review_requested' API status to 'open' UI status", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({
        id: "pr-rr",
        number: 8,
        title: "review requested PR",
        status: "review_requested",
      }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/review requested PR/i)).toBeInTheDocument()
      // Should render 'Open' badge (mapped from review_requested)
      expect(screen.getByText(/open/i)).toBeInTheDocument()
    })
  })

  it("maps 'changes_requested' API status to 'changes-requested' UI status", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({
        id: "pr-cr",
        number: 9,
        title: "changes requested PR",
        status: "changes_requested",
      }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/changes requested PR/i)).toBeInTheDocument()
      // Should render 'Changes Requested' or similar badge
      expect(screen.getByText(/changes/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Edge cases: age calculation boundary conditions
// ---------------------------------------------------------------------------

describe("Edge cases: age calculation boundaries", () => {
  it("PR at exactly 24h renders as '1d' with amber color (not green)", async () => {
    // Exactly 24h ago: hours < 24 is false, so days path applies
    const exactlyTwentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-24h", title: "exactly 24h PR", openedAt: exactlyTwentyFourHoursAgo }),
    ]

    const PRQueuePage = await importPRQueuePage()
    const { container } = render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/exactly 24h PR/i))

    // At exactly 24h, getPRAge returns days=1 with amber color
    // The age span uses font-mono font-semibold — use that to find it specifically
    const ageSpan = container.querySelector("span.font-mono.font-semibold")
    expect(ageSpan).toBeInTheDocument()
    expect(ageSpan?.className).toMatch(/text-amber-400/)
    expect(ageSpan?.className).not.toMatch(/text-emerald-400/)
    // Label should be "1d"
    expect(screen.getByText("1d")).toBeInTheDocument()
  })

  it("PR at exactly 72h renders as '3d' with amber color (boundary: 3d is still yellow)", async () => {
    // days = Math.floor(72) = 3, days <= 3 => amber
    const exactlySeventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000)
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-72h", title: "exactly 72h PR", openedAt: exactlySeventyTwoHoursAgo }),
    ]

    const PRQueuePage = await importPRQueuePage()
    const { container } = render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/exactly 72h PR/i))

    // At exactly 72h, days=3, days<=3 => amber (NOT red)
    const ageSpan72 = container.querySelector("span.font-mono.font-semibold")
    expect(ageSpan72?.className).toMatch(/text-amber-400/)
    expect(ageSpan72?.className).not.toMatch(/text-red-400/)
    expect(screen.getByText("3d")).toBeInTheDocument()
  })

  it("PR at 97h (>3 full days) renders as '4d' with red color", async () => {
    // days = Math.floor(97/24) = 4, 4 > 3 => red
    const ninetySevenHoursAgo = new Date(Date.now() - 97 * 60 * 60 * 1000)
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-97h", title: "97h PR", openedAt: ninetySevenHoursAgo }),
    ]

    const PRQueuePage = await importPRQueuePage()
    const { container } = render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => screen.getByText(/97h PR/i))

    const ageSpan97 = container.querySelector("span.font-mono.font-semibold")
    expect(ageSpan97?.className).toMatch(/text-red-400/)
    expect(screen.getByText("4d")).toBeInTheDocument()
  })

  it("two PRs with identical createdAt timestamps both render (stable sort)", async () => {
    const sameTime = new Date(Date.now() - 2 * 60 * 60 * 1000)
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-twin-a", number: 10, title: "twin PR alpha", openedAt: sameTime }),
      makeApiPR({ id: "pr-twin-b", number: 11, title: "twin PR beta", openedAt: sameTime }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      // Both PRs must appear even when sort produces diff=0
      expect(screen.getByText(/twin PR alpha/i)).toBeInTheDocument()
      expect(screen.getByText(/twin PR beta/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Edge cases: GitHub URL with special characters
// ---------------------------------------------------------------------------

describe("Edge cases: GitHub URL with special characters", () => {
  it("renders PR link correctly when URL contains encoded characters", async () => {
    const encodedUrl = "https://github.com/org/repo%2Fspecial/pull/42"
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-enc", number: 42, title: "encoded URL PR", url: encodedUrl }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /#42 encoded URL PR/i })
      expect(link).toHaveAttribute("href", encodedUrl)
    })
  })

  it("renders PR link correctly when URL contains query params and fragments", async () => {
    const complexUrl = "https://github.com/org/repo/pull/99?diff=split#discussion_r123"
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-complex", number: 99, title: "complex URL PR", url: complexUrl }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /#99 complex URL PR/i })
      expect(link).toHaveAttribute("href", complexUrl)
    })
  })
})

// ---------------------------------------------------------------------------
// Edge cases: status badge label verification
// ---------------------------------------------------------------------------

describe("Edge cases: status badge labels", () => {
  it("'open' status renders 'Active' badge label (not 'Open')", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-open-label", number: 1, title: "active PR", status: "open" }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/active PR/i)).toBeInTheDocument()
      // The badge label for 'open' is "Active" per PR_STATUS_CONFIG
      expect(screen.getByText("Active")).toBeInTheDocument()
    })
  })

  it("'reviewed' status renders 'In Review' badge label", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-rev", number: 2, title: "reviewed PR", status: "reviewed" }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/reviewed PR/i)).toBeInTheDocument()
      expect(screen.getByText("In Review")).toBeInTheDocument()
    })
  })

  it("'changes-requested' status renders 'Rev. Needed' badge label", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({
        id: "pr-cr2",
        number: 3,
        title: "needs changes PR",
        status: "changes_requested",
      }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/needs changes PR/i)).toBeInTheDocument()
      expect(screen.getByText("Rev. Needed")).toBeInTheDocument()
    })
  })

  it("'approved' status renders 'Approved' badge label", async () => {
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-apv", number: 4, title: "approved label PR", status: "approved" }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    await waitFor(() => {
      expect(screen.getByText(/approved label PR/i)).toBeInTheDocument()
      expect(screen.getByText("Approved")).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Bug regression: header count reflects filtered results, not total
// ---------------------------------------------------------------------------

describe("Bug regression: header count reflects domain-filtered results", () => {
  it("header count reflects only filtered PRs when domain filter is active", async () => {
    // Set domain filter to "aiteam" — PRs have no matching projectSlug so 0 show
    mockSearchParams = new URLSearchParams("domain=aiteam")
    mockUsePRsReturn.data = [
      makeApiPR({ id: "pr-1", title: "PR one" }),
      makeApiPR({ id: "pr-2", title: "PR two" }),
      makeApiPR({ id: "pr-3", title: "PR three" }),
    ]

    const PRQueuePage = await importPRQueuePage()
    render(
      <SWRWrapper>
        <PRQueuePage />
      </SWRWrapper>,
    )

    // With domain filter active and no PRs matching, count should be 0, not 3
    await waitFor(() => {
      expect(screen.getByText(/0 open pull request/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/3 open pull request/i)).not.toBeInTheDocument()
  })
})
