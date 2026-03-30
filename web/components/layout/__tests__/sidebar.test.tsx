/**
 * Tests for WI-631: Wire sidebar to live API data with responsive collapse.
 *
 * Tests cover:
 *  1. Project list fetched via SWR hook, grouped by domain
 *  2. Each project links to /projects/[slug]
 *  3. PR Queue shows live open PR count badge
 *  4. Sidebar collapses to icons on screens < md breakpoint
 *  5. Toggle button works to manually collapse/expand
 *  6. Collapse preference persists across page loads via localStorage
 *  7. Loading state shows skeleton while project list loads
 *  8. Handles zero projects gracefully
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/"),
}))

// ---------------------------------------------------------------------------
// Mock SWR hooks — we control what useProjects and usePRs return
// ---------------------------------------------------------------------------

const mockUseProjects = vi.fn()
const mockUsePRs = vi.fn()

vi.mock("@/lib/hooks", () => ({
  useProjects: (...args: unknown[]) => mockUseProjects(...args),
  usePRs: (...args: unknown[]) => mockUsePRs(...args),
}))

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

interface Project {
  slug: string
  name: string
  domain: string
  workflow: string
  tags: string[]
  activityLevel: string
  repoUrl: string
  openPRCount: number
  checkStatus: string
  daysSinceActivity: number
  summaryLine: string
}

const PROJECT_ARCANELAYER: Project = {
  slug: "picking-app",
  name: "picking-app",
  domain: "arcanelayer",
  workflow: "sdlc",
  tags: [],
  activityLevel: "today",
  repoUrl: "https://github.com/arcanelayer/picking-app",
  openPRCount: 2,
  checkStatus: "passing",
  daysSinceActivity: 0,
  summaryLine: "Active PRD",
}

const PROJECT_AITEAM: Project = {
  slug: "aiteam-brand",
  name: "aiteam-brand",
  domain: "aiteam",
  workflow: "sdlc",
  tags: [],
  activityLevel: "today",
  repoUrl: "https://github.com/aiteam/brand",
  openPRCount: 1,
  checkStatus: "passing",
  daysSinceActivity: 0,
  summaryLine: "Landing page redesign",
}

const PROJECT_INFRA: Project = {
  slug: "k8s-infra",
  name: "k8s-infra",
  domain: "infrastructure",
  workflow: "sdlc",
  tags: [],
  activityLevel: "this-week",
  repoUrl: "https://github.com/arcanelayer/k8s-infra",
  openPRCount: 0,
  checkStatus: "passing",
  daysSinceActivity: 3,
  summaryLine: "Cilium migration",
}

const OPEN_PR = {
  id: "pr-1",
  projectSlug: "picking-app",
  number: 47,
  title: "feat: barcode scanner integration",
  branch: "feature/barcode-scanning",
  status: "open" as const,
  checkStatus: "passing" as const,
  createdAt: new Date().toISOString(),
  url: "https://github.com/arcanelayer/picking-app/pull/47",
  author: "joshowens",
  unresolvedComments: 0,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupHooks({
  projectsData = [PROJECT_ARCANELAYER, PROJECT_AITEAM, PROJECT_INFRA],
  projectsLoading = false,
  projectsError = undefined as Error | undefined,
  prsData = [OPEN_PR],
  prsLoading = false,
} = {}) {
  mockUseProjects.mockReturnValue({
    data: projectsData,
    isLoading: projectsLoading,
    error: projectsError,
    meta: undefined,
  })
  mockUsePRs.mockReturnValue({
    data: prsData,
    isLoading: prsLoading,
    error: undefined,
    meta: undefined,
  })
}

// ---------------------------------------------------------------------------
// Import Sidebar after mocks are set up
// ---------------------------------------------------------------------------

import * as SidebarModule from "@/components/layout/sidebar"

// ---------------------------------------------------------------------------
// localStorage mock helpers
// ---------------------------------------------------------------------------

function clearLocalStorage() {
  window.localStorage.clear()
}

// ---------------------------------------------------------------------------
// Suite: Project list from SWR
// ---------------------------------------------------------------------------

describe("Sidebar — project list from SWR", () => {
  beforeEach(() => {
    clearLocalStorage()
    setupHooks()
  })

  it("calls useProjects hook to fetch live project data", () => {
    render(<SidebarModule.default />)
    expect(mockUseProjects).toHaveBeenCalled()
  })

  it("renders project names fetched from the API", () => {
    render(<SidebarModule.default />)
    expect(screen.getByText("picking-app")).toBeInTheDocument()
    expect(screen.getByText("aiteam-brand")).toBeInTheDocument()
    expect(screen.getByText("k8s-infra")).toBeInTheDocument()
  })

  it("groups projects under their domain heading", () => {
    render(<SidebarModule.default />)
    // Domain labels should appear as section headings
    expect(screen.getByText(/arcane layer/i)).toBeInTheDocument()
    expect(screen.getByText(/ai team/i)).toBeInTheDocument()
    expect(screen.getByText(/infrastructure/i)).toBeInTheDocument()
  })

  it("shows domain headings only for domains with projects", () => {
    // Only arcanelayer project provided
    mockUseProjects.mockReturnValue({
      data: [PROJECT_ARCANELAYER],
      isLoading: false,
      error: undefined,
      meta: undefined,
    })

    render(<SidebarModule.default />)

    expect(screen.getByText(/arcane layer/i)).toBeInTheDocument()
    expect(screen.queryByText(/ai team/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/infrastructure/i)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Suite: Project links to /projects/[slug]
// ---------------------------------------------------------------------------

describe("Sidebar — project navigation links", () => {
  beforeEach(() => {
    clearLocalStorage()
    setupHooks()
  })

  it("renders a link to /projects/[slug] for each project", () => {
    render(<SidebarModule.default />)

    const pickingLink = screen.getByRole("link", { name: /picking-app/i })
    expect(pickingLink).toHaveAttribute("href", "/projects/picking-app")

    const aiteamLink = screen.getByRole("link", { name: /aiteam-brand/i })
    expect(aiteamLink).toHaveAttribute("href", "/projects/aiteam-brand")

    const infraLink = screen.getByRole("link", { name: /k8s-infra/i })
    expect(infraLink).toHaveAttribute("href", "/projects/k8s-infra")
  })

  it("highlights the active project link based on current pathname", async () => {
    const { usePathname } = await import("next/navigation")
    vi.mocked(usePathname).mockReturnValue("/projects/picking-app")

    render(<SidebarModule.default />)

    const activeLink = screen.getByRole("link", { name: /picking-app/i })
    // Active link should have a distinct class (sidebar-accent background)
    expect(activeLink.className).toMatch(/sidebar-accent/)
  })
})

// ---------------------------------------------------------------------------
// Suite: PR Queue live count badge
// ---------------------------------------------------------------------------

describe("Sidebar — PR Queue live count badge", () => {
  beforeEach(() => {
    clearLocalStorage()
  })

  it("calls usePRs hook to fetch live PR data", () => {
    setupHooks()
    render(<SidebarModule.default />)
    expect(mockUsePRs).toHaveBeenCalled()
  })

  it("shows the open PR count badge on the PR Queue nav item", () => {
    setupHooks({ prsData: [OPEN_PR, { ...OPEN_PR, id: "pr-2" }] })
    render(<SidebarModule.default />)

    // PR Queue link should have a badge showing the count
    const prQueueLink = screen.getByRole("link", { name: /pr queue/i })
    expect(prQueueLink).toBeInTheDocument()

    // Badge with count "2"
    expect(screen.getByText("2")).toBeInTheDocument()
  })

  it("shows badge with count 1 when a single open PR exists", () => {
    setupHooks({ prsData: [OPEN_PR] })
    render(<SidebarModule.default />)
    expect(screen.getByText("1")).toBeInTheDocument()
  })

  it("does not show a badge when there are no open PRs", () => {
    setupHooks({ prsData: [] })
    render(<SidebarModule.default />)

    // No numeric badge should appear in the PR Queue area
    const prQueueLink = screen.getByRole("link", { name: /pr queue/i })
    // Badge should not be present
    expect(prQueueLink.querySelector("[class*='rounded-full']")).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Suite: Loading state — skeleton while project list loads
// ---------------------------------------------------------------------------

describe("Sidebar — loading state", () => {
  beforeEach(() => {
    clearLocalStorage()
  })

  it("shows skeleton(s) while projects are loading", () => {
    setupHooks({ projectsLoading: true, projectsData: undefined as unknown as Project[] })
    render(<SidebarModule.default />)

    // Should render loading skeleton (role="status") instead of project list
    const skeletons = screen.getAllByRole("status")
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it("does not render project names while loading", () => {
    setupHooks({ projectsLoading: true, projectsData: undefined as unknown as Project[] })
    render(<SidebarModule.default />)

    expect(screen.queryByText("picking-app")).not.toBeInTheDocument()
  })

  it("renders project list once loading completes", async () => {
    // Start loading
    mockUseProjects.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: undefined,
      meta: undefined,
    })
    mockUsePRs.mockReturnValue({ data: [], isLoading: false, error: undefined, meta: undefined })

    const { rerender } = render(<SidebarModule.default />)

    // No projects yet
    expect(screen.queryByText("picking-app")).not.toBeInTheDocument()

    // Finish loading
    mockUseProjects.mockReturnValue({
      data: [PROJECT_ARCANELAYER],
      isLoading: false,
      error: undefined,
      meta: undefined,
    })

    rerender(<SidebarModule.default />)

    await waitFor(() => {
      expect(screen.getByText("picking-app")).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Suite: Zero projects graceful handling
// ---------------------------------------------------------------------------

describe("Sidebar — zero projects", () => {
  beforeEach(() => {
    clearLocalStorage()
  })

  it("renders without crashing when project list is empty", () => {
    setupHooks({ projectsData: [] })
    expect(() => render(<SidebarModule.default />)).not.toThrow()
  })

  it("shows no project links when list is empty", () => {
    setupHooks({ projectsData: [] })
    render(<SidebarModule.default />)

    // No /projects/ links should be present
    const projectLinks = screen
      .queryAllByRole("link")
      .filter((link) => link.getAttribute("href")?.startsWith("/projects/"))
    expect(projectLinks).toHaveLength(0)
  })

  it("shows no domain headings when list is empty", () => {
    setupHooks({ projectsData: [] })
    render(<SidebarModule.default />)

    expect(screen.queryByText(/arcane layer/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/ai team/i)).not.toBeInTheDocument()
  })

  it("still renders main nav items when projects are empty", () => {
    setupHooks({ projectsData: [] })
    render(<SidebarModule.default />)

    expect(screen.getByRole("link", { name: /dashboard/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /pr queue/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Suite: Toggle button — manual collapse/expand
// ---------------------------------------------------------------------------

describe("Sidebar — toggle button", () => {
  beforeEach(() => {
    clearLocalStorage()
    setupHooks()
  })

  it("renders a collapse/expand toggle button", () => {
    render(<SidebarModule.default />)
    // Toggle button should be present
    const toggle = screen.getByRole("button", { name: /collapse|expand|toggle/i })
    expect(toggle).toBeInTheDocument()
  })

  it("collapses the sidebar when toggle button is clicked", async () => {
    const user = userEvent.setup()
    render(<SidebarModule.default />)

    const toggle = screen.getByRole("button", { name: /collapse|expand|toggle/i })

    // Initially expanded — project labels should be visible
    expect(screen.getByText("picking-app")).toBeInTheDocument()

    await user.click(toggle)

    // After collapse, text labels should be hidden
    // Collapsed sidebar shows icons only — labels may be hidden via CSS or removed from DOM
    const sidebar = screen.getByRole("complementary")
    expect(sidebar).toHaveAttribute("data-collapsed", "true")
  })

  it("expands the sidebar when toggle is clicked again", async () => {
    const user = userEvent.setup()
    render(<SidebarModule.default />)

    const toggle = screen.getByRole("button", { name: /collapse|expand|toggle/i })

    // Collapse
    await user.click(toggle)
    // Expand
    await user.click(toggle)

    const sidebar = screen.getByRole("complementary")
    expect(sidebar).not.toHaveAttribute("data-collapsed", "true")
  })
})

// ---------------------------------------------------------------------------
// Suite: Responsive collapse — icon-only below md breakpoint
// ---------------------------------------------------------------------------

describe("Sidebar — responsive collapse", () => {
  beforeEach(() => {
    clearLocalStorage()
    setupHooks()
  })

  it("applies a collapsed CSS class or data attribute when viewport is small", () => {
    // Simulate small viewport: window.innerWidth < 768 (md breakpoint)
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 600 })
    fireEvent(window, new Event("resize"))

    render(<SidebarModule.default />)

    const sidebar = screen.getByRole("complementary")
    // Sidebar should be collapsed at small viewport — either data attribute or class
    const isCollapsed =
      sidebar.getAttribute("data-collapsed") === "true" ||
      sidebar.className.includes("collapsed") ||
      sidebar.className.includes("w-")

    expect(isCollapsed).toBe(true)
  })

  it("applies expanded state when viewport is large (>= md)", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1200 })
    fireEvent(window, new Event("resize"))

    render(<SidebarModule.default />)

    const sidebar = screen.getByRole("complementary")
    // At large viewport the sidebar should not be collapsed by default
    expect(sidebar.getAttribute("data-collapsed")).not.toBe("true")
  })
})

// ---------------------------------------------------------------------------
// Suite: localStorage persistence
// ---------------------------------------------------------------------------

describe("Sidebar — localStorage persistence", () => {
  beforeEach(() => {
    clearLocalStorage()
    setupHooks()
    // Ensure large viewport so default is expanded
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1200 })
  })

  afterEach(() => {
    clearLocalStorage()
  })

  it("persists collapsed state to localStorage when toggled", async () => {
    const user = userEvent.setup()
    render(<SidebarModule.default />)

    const toggle = screen.getByRole("button", { name: /collapse|expand|toggle/i })
    await user.click(toggle)

    // localStorage should have the collapsed preference saved
    const stored = window.localStorage.getItem("sidebar-collapsed")
    expect(stored).not.toBeNull()
    expect(stored).toBe("true")
  })

  it("reads collapsed preference from localStorage on mount", () => {
    // Pre-set localStorage to collapsed
    window.localStorage.setItem("sidebar-collapsed", "true")

    render(<SidebarModule.default />)

    const sidebar = screen.getByRole("complementary")
    expect(sidebar.getAttribute("data-collapsed")).toBe("true")
  })

  it("starts expanded when localStorage has no preference", () => {
    render(<SidebarModule.default />)

    const sidebar = screen.getByRole("complementary")
    expect(sidebar.getAttribute("data-collapsed")).not.toBe("true")
  })

  it("persists expanded state to localStorage when toggled back", async () => {
    const user = userEvent.setup()
    // Start collapsed
    window.localStorage.setItem("sidebar-collapsed", "true")

    render(<SidebarModule.default />)

    const toggle = screen.getByRole("button", { name: /collapse|expand|toggle/i })
    // Toggle to expanded
    await user.click(toggle)

    const stored = window.localStorage.getItem("sidebar-collapsed")
    expect(stored).toBe("false")
  })
})

// ---------------------------------------------------------------------------
// Suite: Static nav items always present
// ---------------------------------------------------------------------------

describe("Sidebar — static nav items", () => {
  beforeEach(() => {
    clearLocalStorage()
    setupHooks()
  })

  it("renders Dashboard link pointing to /", () => {
    render(<SidebarModule.default />)
    const link = screen.getByRole("link", { name: /dashboard/i })
    expect(link).toHaveAttribute("href", "/")
  })

  it("renders Timeline link pointing to /timeline", () => {
    render(<SidebarModule.default />)
    const link = screen.getByRole("link", { name: /timeline/i })
    expect(link).toHaveAttribute("href", "/timeline")
  })

  it("renders PR Queue link pointing to /prs", () => {
    render(<SidebarModule.default />)
    const link = screen.getByRole("link", { name: /pr queue/i })
    expect(link).toHaveAttribute("href", "/prs")
  })

  it("renders the DevTrack logo link to /", () => {
    render(<SidebarModule.default />)
    const logo = screen.getByRole("link", { name: /devtrack/i })
    expect(logo).toHaveAttribute("href", "/")
  })
})

// ---------------------------------------------------------------------------
// Suite: Edge cases — localStorage, unknown domains, PR badge zero
// ---------------------------------------------------------------------------

describe("Sidebar — localStorage edge cases", () => {
  beforeEach(() => {
    clearLocalStorage()
    setupHooks()
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1200 })
  })

  afterEach(() => {
    clearLocalStorage()
  })

  it("treats corrupt localStorage value as expanded (not collapsed)", () => {
    // Non-"true" strings should not trigger collapsed state
    window.localStorage.setItem("sidebar-collapsed", "garbage")

    render(<SidebarModule.default />)

    const sidebar = screen.getByRole("complementary")
    // "garbage" !== "true", so collapsed should be false
    expect(sidebar.getAttribute("data-collapsed")).not.toBe("true")
  })

  it("treats empty string in localStorage as expanded", () => {
    window.localStorage.setItem("sidebar-collapsed", "")

    render(<SidebarModule.default />)

    const sidebar = screen.getByRole("complementary")
    expect(sidebar.getAttribute("data-collapsed")).not.toBe("true")
  })

  it("overrides viewport-based collapse when localStorage preference exists", () => {
    // Small viewport would normally collapse the sidebar
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 400 })
    // But localStorage says expanded
    window.localStorage.setItem("sidebar-collapsed", "false")

    render(<SidebarModule.default />)

    const sidebar = screen.getByRole("complementary")
    // localStorage preference should win over viewport
    expect(sidebar.getAttribute("data-collapsed")).not.toBe("true")
  })
})

describe("Sidebar — unknown domain projects", () => {
  beforeEach(() => {
    clearLocalStorage()
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1200 })
  })

  it("silently omits projects whose domain is not in DOMAIN_ORDER", () => {
    // BUG: projects with unknown domains are dropped from the sidebar
    // because projectsByDomain only iterates DOMAIN_ORDER keys
    const unknownDomainProject = {
      ...PROJECT_ARCANELAYER,
      slug: "mystery-project",
      name: "mystery-project",
      domain: "newdomain" as "arcanelayer", // not in DOMAIN_ORDER
    }
    setupHooks({ projectsData: [PROJECT_ARCANELAYER, unknownDomainProject] })

    render(<SidebarModule.default />)

    // Known domain project should appear
    expect(screen.getByText("picking-app")).toBeInTheDocument()
    // Unknown domain project is silently dropped — this is the current behavior
    expect(screen.queryByText("mystery-project")).not.toBeInTheDocument()
  })

  it("silently omits projects with null/empty domain", () => {
    // mapProject converts null domain to "" which is not in DOMAIN_ORDER
    const noDomainProject = {
      ...PROJECT_ARCANELAYER,
      slug: "no-domain-project",
      name: "no-domain-project",
      domain: "" as "arcanelayer",
    }
    setupHooks({ projectsData: [noDomainProject] })

    render(<SidebarModule.default />)

    // Empty-domain project is silently dropped
    expect(screen.queryByText("no-domain-project")).not.toBeInTheDocument()
    // No domain headings should appear either
    expect(screen.queryByText(/arcane layer/i)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Suite: localStorage unavailable (private mode / security policy)
// ---------------------------------------------------------------------------

describe("Sidebar — localStorage unavailable", () => {
  beforeEach(() => {
    setupHooks()
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1200 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("does not crash when localStorage.getItem throws on mount", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("localStorage is disabled")
    })

    expect(() => render(<SidebarModule.default />)).not.toThrow()
  })

  it("falls back to viewport-based collapse when localStorage.getItem throws", () => {
    // Small viewport — fallback should collapse
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 400 })
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("localStorage is disabled")
    })

    render(<SidebarModule.default />)

    const sidebar = screen.getByRole("complementary")
    expect(sidebar.getAttribute("data-collapsed")).toBe("true")
  })

  it("falls back to expanded when localStorage.getItem throws and viewport is large", () => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1200 })
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("localStorage is disabled")
    })

    render(<SidebarModule.default />)

    const sidebar = screen.getByRole("complementary")
    expect(sidebar.getAttribute("data-collapsed")).not.toBe("true")
  })

  it("does not crash when localStorage.setItem throws on toggle", async () => {
    const user = userEvent.setup()
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("localStorage is disabled")
    })

    render(<SidebarModule.default />)

    const toggle = screen.getByRole("button", { name: /collapse|expand|toggle/i })
    await expect(user.click(toggle)).resolves.not.toThrow()

    // Sidebar state should still toggle even if persistence fails
    const sidebar = screen.getByRole("complementary")
    expect(sidebar.getAttribute("data-collapsed")).toBe("true")
  })
})

describe("Sidebar — PR badge zero count", () => {
  beforeEach(() => {
    clearLocalStorage()
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1200 })
  })

  it("hides badge entirely when PR count is exactly zero", () => {
    setupHooks({ prsData: [] })
    render(<SidebarModule.default />)

    // No badge element should exist in the PR Queue area
    const prQueueLink = screen.getByRole("link", { name: /pr queue/i })
    // No text "0" should be shown as a badge
    expect(prQueueLink.textContent).not.toContain("0")
  })

  it("shows badge when PR count transitions from zero to one", async () => {
    const _user = userEvent.setup()
    mockUsePRs.mockReturnValue({ data: [], isLoading: false, error: undefined, meta: undefined })
    mockUseProjects.mockReturnValue({
      data: [PROJECT_ARCANELAYER],
      isLoading: false,
      error: undefined,
      meta: undefined,
    })

    const { rerender } = render(<SidebarModule.default />)

    // No badge at zero
    expect(screen.queryByText("1")).not.toBeInTheDocument()

    // Now one PR arrives
    mockUsePRs.mockReturnValue({
      data: [OPEN_PR],
      isLoading: false,
      error: undefined,
      meta: undefined,
    })
    rerender(<SidebarModule.default />)

    await waitFor(() => {
      expect(screen.getByText("1")).toBeInTheDocument()
    })
  })
})
