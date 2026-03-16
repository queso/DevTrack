import { describe, expect, it } from "vitest"
import type { ParsedContent } from "@/types/content-parser"

const { parseContentFile } = await import("@/lib/content-parser")

describe("parseContentFile", () => {
  const draftMarkdown = `---
title: My Draft Post
summary: A draft about something interesting
status: draft
tags:
  - typescript
  - tutorial
---

Draft body content here.
`

  const publishedMarkdown = `---
title: Published Article
summary: An article about deployment
status: published
tags:
  - devops
  - kubernetes
---

Published body content here.
`

  const minimalMarkdown = `---
title: Minimal Post
status: draft
---

Body content.
`

  describe("frontmatter extraction", () => {
    it("extracts title, summary, status, and tags from a draft file", () => {
      const result: ParsedContent = parseContentFile(draftMarkdown, "drafts/my-draft.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result.frontmatter).not.toBeNull()
      expect(result.frontmatter?.title).toBe("My Draft Post")
      expect(result.frontmatter?.summary).toBe("A draft about something interesting")
      expect(result.frontmatter?.status).toBe("draft")
      expect(result.frontmatter?.tags).toEqual(["typescript", "tutorial"])
    })

    it("extracts title, summary, status, and tags from a published file", () => {
      const result = parseContentFile(publishedMarkdown, "content/published-article.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result.frontmatter?.title).toBe("Published Article")
      expect(result.frontmatter?.summary).toBe("An article about deployment")
      expect(result.frontmatter?.status).toBe("published")
      expect(result.frontmatter?.tags).toEqual(["devops", "kubernetes"])
    })

    it("accepts 'draft' as a valid status value", () => {
      const result = parseContentFile(draftMarkdown, "drafts/post.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })
      expect(result.frontmatter?.status).toBe("draft")
    })

    it("accepts 'published' as a valid status value", () => {
      const result = parseContentFile(publishedMarkdown, "content/post.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })
      expect(result.frontmatter?.status).toBe("published")
    })
  })

  describe("optional fields with defaults", () => {
    it("returns undefined summary when summary field is missing", () => {
      const result = parseContentFile(minimalMarkdown, "drafts/minimal.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result.frontmatter?.summary).toBeUndefined()
    })

    it("returns undefined or empty tags when tags field is missing", () => {
      const result = parseContentFile(minimalMarkdown, "drafts/minimal.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result.frontmatter?.tags == null || result.frontmatter?.tags?.length === 0).toBe(true)
    })

    it("returns empty tags array when tags field is an empty list", () => {
      const md = `---
title: No Tags Post
status: draft
tags: []
---
`
      const result = parseContentFile(md, "drafts/post.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result.frontmatter?.tags).toEqual([])
    })
  })

  describe("null frontmatter", () => {
    it("returns null frontmatter for files with no frontmatter block", () => {
      const md = `# Just Prose

No frontmatter here at all.
`
      const result = parseContentFile(md, "drafts/no-fm.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result.frontmatter).toBeNull()
    })

    it("returns null frontmatter for files with empty frontmatter block", () => {
      const md = `---
---

Body content.
`
      const result = parseContentFile(md, "drafts/empty.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result.frontmatter).toBeNull()
    })

    it("returns null frontmatter when required title is missing", () => {
      const md = `---
status: draft
tags:
  - missing-title
---
`
      const result = parseContentFile(md, "drafts/no-title.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result.frontmatter).toBeNull()
    })

    it("returns null frontmatter when status is missing", () => {
      const md = `---
title: No Status Post
summary: Some summary
---
`
      const result = parseContentFile(md, "drafts/no-status.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result.frontmatter).toBeNull()
    })

    it("returns null frontmatter for an empty string input", () => {
      const result = parseContentFile("", "drafts/empty.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result.frontmatter).toBeNull()
    })
  })

  describe("isDraft determination", () => {
    it("marks file as draft when it is under the draftPath", () => {
      const result = parseContentFile(draftMarkdown, "drafts/my-draft.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result.isDraft).toBe(true)
    })

    it("marks file as not draft when it is under the contentPath", () => {
      const result = parseContentFile(publishedMarkdown, "content/published.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result.isDraft).toBe(false)
    })

    it("marks file as draft when frontmatter status is 'draft' regardless of path", () => {
      const result = parseContentFile(draftMarkdown, "content/still-draft.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      // status: draft in frontmatter should signal isDraft even if in content path
      expect(result.isDraft).toBe(true)
    })

    it("marks file as not draft when frontmatter status is 'published' and in contentPath", () => {
      const result = parseContentFile(publishedMarkdown, "content/article.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result.isDraft).toBe(false)
    })
  })

  describe("sourcePath", () => {
    it("returns the provided file path as sourcePath", () => {
      const result = parseContentFile(draftMarkdown, "drafts/my-draft.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result.sourcePath).toBe("drafts/my-draft.md")
    })

    it("preserves the full path including subdirectories", () => {
      const result = parseContentFile(publishedMarkdown, "content/2024/q1/article.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result.sourcePath).toBe("content/2024/q1/article.md")
    })
  })

  describe("return type", () => {
    it("returns a ParsedContent object with frontmatter, sourcePath, and isDraft", () => {
      const result = parseContentFile(draftMarkdown, "drafts/post.md", {
        contentPath: "content/",
        draftPath: "drafts/",
      })

      expect(result).toHaveProperty("frontmatter")
      expect(result).toHaveProperty("sourcePath")
      expect(result).toHaveProperty("isDraft")
      expect(typeof result.sourcePath).toBe("string")
      expect(typeof result.isDraft).toBe("boolean")
    })
  })
})
