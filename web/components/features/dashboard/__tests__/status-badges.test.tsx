/**
 * Regression tests for PRStatusBadge.
 *
 * A `closed` PR (a valid PullRequestStatus with no config entry) made the badge
 * dereference `undefined.label`, crashing the entire PR Queue page. The badge
 * must render every status and degrade gracefully on any unmapped value.
 */

import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PRStatusBadge } from "@/components/features/dashboard/status-badges"

describe("PRStatusBadge", () => {
  it("renders every known status without crashing", () => {
    for (const status of [
      "draft",
      "open",
      "reviewed",
      "changes-requested",
      "approved",
      "merged",
      "closed",
    ]) {
      const { container } = render(<PRStatusBadge status={status} />)
      expect(container.textContent?.length).toBeGreaterThan(0)
    }
  })

  it("labels a closed PR (the status that used to crash the page)", () => {
    const { container } = render(<PRStatusBadge status="closed" />)
    expect(container.textContent).toContain("Closed")
  })

  it("falls back gracefully for an unknown status instead of throwing", () => {
    // Previously: undefined config -> "Cannot read properties of undefined".
    expect(() => render(<PRStatusBadge status="something_new" />)).not.toThrow()
    const { container } = render(<PRStatusBadge status="something_new" />)
    expect(container.textContent).toContain("Unknown")
  })
})
