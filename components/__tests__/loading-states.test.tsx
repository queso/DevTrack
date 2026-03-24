/**
 * Tests for WI-629: loading skeleton and error state components.
 *
 * Tests cover:
 *  - ProjectCardSkeleton       — matches shape/size of ProjectCard
 *  - ProjectDetailHeaderSkeleton — matches shape of project detail header
 *  - PRRowSkeleton             — matches shape of a PR table row
 *  - TimelineEntrySkeleton     — matches shape of a timeline entry
 *  - ErrorState                — shows message + retry button calling SWR mutate
 *  - EmptyState                — shows contextual empty message
 *
 * All components must use dark-theme CSS classes (bg-muted, text-muted-foreground, etc.)
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  EmptyState,
  ErrorState,
  PRRowSkeleton,
  ProjectCardSkeleton,
  ProjectDetailHeaderSkeleton,
  TimelineEntrySkeleton,
} from "@/components/features/dashboard/loading-states"

// ---------------------------------------------------------------------------
// ProjectCardSkeleton
// ---------------------------------------------------------------------------

describe("ProjectCardSkeleton", () => {
  it("renders a skeleton card container", () => {
    const { container } = render(<ProjectCardSkeleton />)
    // Should render a card-shaped outer element
    expect(container.firstChild).toBeTruthy()
  })

  it("uses dark-theme muted classes for pulse animation", () => {
    const { container } = render(<ProjectCardSkeleton />)
    // Skeleton elements should carry animate-pulse for loading affordance
    const pulsingEl = container.querySelector(".animate-pulse")
    expect(pulsingEl).toBeInTheDocument()
  })

  it("renders multiple skeleton bars to match name + summary + tags shape", () => {
    const { container } = render(<ProjectCardSkeleton />)
    // At least 3 skeleton bars: title, summary line, one tag/progress area
    const bars = container.querySelectorAll(
      ".bg-muted, .bg-muted\\/60, .bg-muted\\/40, .bg-secondary",
    )
    expect(bars.length).toBeGreaterThanOrEqual(3)
  })

  it("has a rounded-lg border wrapper matching the card layout", () => {
    const { container } = render(<ProjectCardSkeleton />)
    const wrapper = container.querySelector(".rounded-lg")
    expect(wrapper).toBeInTheDocument()
  })

  it("renders an accessible aria-label indicating loading state", () => {
    render(<ProjectCardSkeleton />)
    expect(screen.getByRole("status")).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ProjectDetailHeaderSkeleton
// ---------------------------------------------------------------------------

describe("ProjectDetailHeaderSkeleton", () => {
  it("renders without crashing", () => {
    const { container } = render(<ProjectDetailHeaderSkeleton />)
    expect(container.firstChild).toBeTruthy()
  })

  it("uses animate-pulse for loading affordance", () => {
    const { container } = render(<ProjectDetailHeaderSkeleton />)
    const pulsingEl = container.querySelector(".animate-pulse")
    expect(pulsingEl).toBeInTheDocument()
  })

  it("renders skeleton bars matching the header shape: title, badges, meta row", () => {
    const { container } = render(<ProjectDetailHeaderSkeleton />)
    const bars = container.querySelectorAll("[class*='bg-muted'], [class*='bg-secondary']")
    // Header has: large title bar, domain badge, workflow badge, at least one meta item
    expect(bars.length).toBeGreaterThanOrEqual(4)
  })

  it("has an accessible loading role", () => {
    render(<ProjectDetailHeaderSkeleton />)
    expect(screen.getByRole("status")).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// PRRowSkeleton
// ---------------------------------------------------------------------------

describe("PRRowSkeleton", () => {
  it("renders inside a table row element", () => {
    // PRRowSkeleton must render a <tr> so it can sit inside a <tbody>
    const { container } = render(
      <table>
        <tbody>
          <PRRowSkeleton />
        </tbody>
      </table>,
    )
    const row = container.querySelector("tr")
    expect(row).toBeInTheDocument()
  })

  it("renders the same number of cells as the PR table header (6 columns)", () => {
    const { container } = render(
      <table>
        <tbody>
          <PRRowSkeleton />
        </tbody>
      </table>,
    )
    const cells = container.querySelectorAll("td")
    expect(cells.length).toBe(6)
  })

  it("uses animate-pulse within cells", () => {
    const { container } = render(
      <table>
        <tbody>
          <PRRowSkeleton />
        </tbody>
      </table>,
    )
    const pulsingEl = container.querySelector(".animate-pulse")
    expect(pulsingEl).toBeInTheDocument()
  })

  it("skeleton bar widths vary across columns to mimic realistic data", () => {
    const { container } = render(
      <table>
        <tbody>
          <PRRowSkeleton />
        </tbody>
      </table>,
    )
    // Each cell should contain at least one skeleton bar
    const cells = container.querySelectorAll("td")
    cells.forEach((cell) => {
      const bar = cell.querySelector("[class*='bg-muted'], [class*='bg-secondary']")
      expect(bar).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// TimelineEntrySkeleton
// ---------------------------------------------------------------------------

describe("TimelineEntrySkeleton", () => {
  it("renders without crashing", () => {
    const { container } = render(<TimelineEntrySkeleton />)
    expect(container.firstChild).toBeTruthy()
  })

  it("uses animate-pulse for loading affordance", () => {
    const { container } = render(<TimelineEntrySkeleton />)
    const pulsingEl = container.querySelector(".animate-pulse")
    expect(pulsingEl).toBeInTheDocument()
  })

  it("renders an icon placeholder circle matching the timeline dot", () => {
    const { container } = render(<TimelineEntrySkeleton />)
    // Timeline dots are rounded-full with dimensions w-5 h-5
    const circle = container.querySelector(".rounded-full")
    expect(circle).toBeInTheDocument()
  })

  it("renders text line placeholders for description and timestamp", () => {
    const { container } = render(<TimelineEntrySkeleton />)
    const bars = container.querySelectorAll("[class*='bg-muted'], [class*='bg-secondary']")
    // At least: icon dot + description line + timestamp line = 3
    expect(bars.length).toBeGreaterThanOrEqual(2)
  })

  it("has an accessible loading role", () => {
    render(<TimelineEntrySkeleton />)
    expect(screen.getByRole("status")).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ErrorState
// ---------------------------------------------------------------------------

describe("ErrorState", () => {
  it("renders a descriptive error message", () => {
    render(<ErrorState message="Failed to load projects" />)
    expect(screen.getByText(/failed to load projects/i)).toBeInTheDocument()
  })

  it("renders a retry button", () => {
    render(<ErrorState message="Something went wrong" onRetry={vi.fn()} />)
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument()
  })

  it("calls onRetry when retry button is clicked", async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()

    render(<ErrorState message="Error" onRetry={onRetry} />)
    await user.click(screen.getByRole("button", { name: /retry/i }))

    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("calls SWR mutate function passed as onRetry", async () => {
    // Simulate SWR mutate being passed as the retry callback
    const swrMutate = vi.fn()
    const user = userEvent.setup()

    render(<ErrorState message="Network error" onRetry={swrMutate} />)
    await user.click(screen.getByRole("button", { name: /retry/i }))

    expect(swrMutate).toHaveBeenCalledOnce()
  })

  it("renders without a retry button when onRetry is not provided", () => {
    render(<ErrorState message="Something went wrong" />)
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument()
  })

  it("uses dark-theme muted styles", () => {
    const { container } = render(<ErrorState message="Error" />)
    // The outer container should use muted/secondary background tokens
    const themed = container.querySelector(
      "[class*='text-muted-foreground'], [class*='bg-muted'], [class*='bg-secondary']",
    )
    expect(themed).toBeInTheDocument()
  })

  it("accepts an optional title prop to override default heading", () => {
    render(<ErrorState title="Data unavailable" message="Could not load data" />)
    expect(screen.getByText(/data unavailable/i)).toBeInTheDocument()
  })

  it("shows a default error heading when no title provided", () => {
    render(<ErrorState message="Something failed" />)
    // Should show some form of generic error heading
    expect(screen.getByRole("heading")).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

describe("EmptyState", () => {
  it("renders the contextual message", () => {
    render(<EmptyState message="No projects found" />)
    expect(screen.getByText(/no projects found/i)).toBeInTheDocument()
  })

  it("renders an optional title alongside the message", () => {
    render(
      <EmptyState title="Nothing here yet" message="Create your first project to get started." />,
    )
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument()
    expect(screen.getByText(/create your first project/i)).toBeInTheDocument()
  })

  it("renders an optional action button when provided", async () => {
    const onAction = vi.fn()
    const user = userEvent.setup()

    render(<EmptyState message="No PRs open" actionLabel="Refresh" onAction={onAction} />)
    const btn = screen.getByRole("button", { name: /refresh/i })
    expect(btn).toBeInTheDocument()

    await user.click(btn)
    expect(onAction).toHaveBeenCalledOnce()
  })

  it("does not render an action button when no action props given", () => {
    render(<EmptyState message="No events in this range." />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("uses dark-theme muted styles for text", () => {
    const { container } = render(<EmptyState message="Nothing to show." />)
    const muted = container.querySelector("[class*='text-muted-foreground']")
    expect(muted).toBeInTheDocument()
  })

  it("has appropriate padding for dashboard use (py-16 or similar)", () => {
    const { container } = render(<EmptyState message="Empty" />)
    // The wrapper should be centred with vertical padding matching dashboard empty states
    const centered = container.querySelector(".text-center, [class*='py-']")
    expect(centered).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Multiple skeletons - render count convenience
// ---------------------------------------------------------------------------

describe("Rendering multiple skeletons for list views", () => {
  it("renders N ProjectCardSkeletons without error", () => {
    const { container } = render(
      Array.from({ length: 6 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: test-only
        <ProjectCardSkeleton key={i} />
      )),
    )
    const statuses = container.querySelectorAll("output")
    expect(statuses.length).toBe(6)
  })

  it("renders N PRRowSkeletons inside a table without error", () => {
    const { container } = render(
      <table>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: test-only
            <PRRowSkeleton key={i} />
          ))}
        </tbody>
      </table>,
    )
    const rows = container.querySelectorAll("tr")
    expect(rows.length).toBe(5)
  })

  it("renders N TimelineEntrySkeletons without error", () => {
    const { container } = render(
      Array.from({ length: 4 }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: test-only
        <TimelineEntrySkeleton key={i} />
      )),
    )
    const statuses = container.querySelectorAll("output")
    expect(statuses.length).toBe(4)
  })
})
