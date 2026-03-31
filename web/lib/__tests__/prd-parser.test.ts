import { describe, expect, it } from "vitest"
import type { ParsedPrd } from "@/types/prd-parser"

const { parsePrd } = await import("@/lib/prd-parser")

describe("parsePrd", () => {
  const fullMarkdown = `---
title: My Feature PRD
summary: Implement the new onboarding flow
status: in-progress
---

## Work Items

- [x] Write technical spec
- [ ] Implement API endpoint
- [x] Add unit tests
- [ ] Deploy to staging
`

  describe("frontmatter parsing", () => {
    it("extracts title, summary, and status from frontmatter", () => {
      const result: ParsedPrd = parsePrd(fullMarkdown)

      expect(result.frontmatter).not.toBeNull()
      expect(result.frontmatter?.title).toBe("My Feature PRD")
      expect(result.frontmatter?.summary).toBe("Implement the new onboarding flow")
      expect(result.frontmatter?.status).toBe("in-progress")
    })

    it("accepts 'queued' as a valid status", () => {
      const md = `---
title: New PRD
summary: Something new
status: queued
---
`
      const result = parsePrd(md)
      expect(result.frontmatter?.status).toBe("queued")
    })

    it("accepts 'in-progress' as a valid status", () => {
      const md = `---
title: Active PRD
summary: Active work
status: in-progress
---
`
      const result = parsePrd(md)
      expect(result.frontmatter?.status).toBe("in-progress")
    })

    it("accepts 'completed' as a valid status", () => {
      const md = `---
title: Done PRD
summary: Finished work
status: completed
---
`
      const result = parsePrd(md)
      expect(result.frontmatter?.status).toBe("completed")
    })

    it("returns null frontmatter for files with no frontmatter block", () => {
      const md = `# Just a plain markdown file

No frontmatter here.
`
      const result = parsePrd(md)
      expect(result.frontmatter).toBeNull()
    })

    it("returns null frontmatter for files with empty frontmatter block", () => {
      const md = `---
---

Some content here.
`
      const result = parsePrd(md)
      expect(result.frontmatter).toBeNull()
    })

    it("returns null frontmatter when required fields are missing", () => {
      const md = `---
title: Missing status and summary
---
`
      const result = parsePrd(md)
      expect(result.frontmatter).toBeNull()
    })

    it("returns null frontmatter for an empty string input", () => {
      const result = parsePrd("")
      expect(result.frontmatter).toBeNull()
    })
  })

  describe("work item parsing", () => {
    it("parses completed checkbox items as completed work items", () => {
      const result = parsePrd(fullMarkdown)

      const completed = result.workItems.filter((wi) => wi.completed)
      expect(completed).toHaveLength(2)
      expect(completed.map((wi) => wi.title)).toContain("Write technical spec")
      expect(completed.map((wi) => wi.title)).toContain("Add unit tests")
    })

    it("parses unchecked checkbox items as pending work items", () => {
      const result = parsePrd(fullMarkdown)

      const pending = result.workItems.filter((wi) => !wi.completed)
      expect(pending).toHaveLength(2)
      expect(pending.map((wi) => wi.title)).toContain("Implement API endpoint")
      expect(pending.map((wi) => wi.title)).toContain("Deploy to staging")
    })

    it("returns work items in document order", () => {
      const result = parsePrd(fullMarkdown)

      expect(result.workItems.map((wi) => wi.title)).toEqual([
        "Write technical spec",
        "Implement API endpoint",
        "Add unit tests",
        "Deploy to staging",
      ])
    })

    it("returns an empty work items array for files with no checklists", () => {
      const md = `---
title: My PRD
summary: Summary here
status: queued
---

## Description

No checklist items here, just prose.
`
      const result = parsePrd(md)
      expect(result.workItems).toEqual([])
    })

    it("returns an empty work items array for files with no content", () => {
      const result = parsePrd("")
      expect(result.workItems).toEqual([])
    })

    it("only parses markdown checkbox syntax (- [x] and - [ ])", () => {
      const md = `- [x] Checked item
- [ ] Unchecked item
- Regular list item (not a work item)
* Another bullet (not a work item)
`
      const result = parsePrd(md)
      expect(result.workItems).toHaveLength(2)
    })

    it("each work item has title (string) and completed (boolean) fields", () => {
      const result = parsePrd(fullMarkdown)

      for (const item of result.workItems) {
        expect(typeof item.title).toBe("string")
        expect(typeof item.completed).toBe("boolean")
      }
    })
  })

  describe("combined output", () => {
    it("returns both frontmatter and work items when both are present", () => {
      const result = parsePrd(fullMarkdown)

      expect(result.frontmatter).not.toBeNull()
      expect(result.workItems.length).toBeGreaterThan(0)
    })

    it("returns null frontmatter with work items when only checklists are present", () => {
      const md = `# PRD without frontmatter

- [x] Done task
- [ ] Pending task
`
      const result = parsePrd(md)
      expect(result.frontmatter).toBeNull()
      expect(result.workItems).toHaveLength(2)
    })

    it("returns typed ParsedPrd shape with frontmatter and workItems keys", () => {
      const result = parsePrd(fullMarkdown)

      expect(result).toHaveProperty("frontmatter")
      expect(result).toHaveProperty("workItems")
      expect(Array.isArray(result.workItems)).toBe(true)
    })
  })
})
